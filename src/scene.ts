// The drawn overlay: a force layout of the collector's graph plus the
// animations that make changes visible. Joins pop in blue, new links flash,
// state changes blend colour, and whatever leaves fades away. The page calls
// sync with every new graph, and step and draw on every frame. The camera
// keeps the whole graph in view until the user pans or zooms.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { familyOf, type CollectorNode, type FlowEvent, type FlowFamily, type Graph, type NodeState } from './collector'

export type RGB = readonly [number, number, number]

// Apple's dark-mode system colours, on a monochrome graph.
export const PALETTE = {
  node: [237, 237, 237] as RGB,
  join: [10, 132, 255] as RGB, // systemBlue
  isolated: [255, 159, 10] as RGB, // systemOrange
  orphaned: [255, 69, 58] as RGB, // systemRed
  /** Smaller components, in order of size; the largest is `node`. */
  components: [
    [94, 92, 230], // systemIndigo
    [191, 90, 242], // systemPurple
    [255, 55, 95], // systemPink
    [100, 210, 255], // systemCyan
    [102, 212, 207], // systemMint
  ] as RGB[],
}
/** One colour per message family, so a pulse says what kind of message went where. */
export const FLOW_COLORS: Record<FlowFamily, RGB> = {
  overlay: [191, 90, 242], // systemPurple: link, link_ack, unlink
  gossip: [255, 214, 10], // systemYellow: update and anti-entropy
  probe: [100, 210, 255], // systemCyan: ping, pong, ping_req, ping_req_ack
  heartbeat: [48, 209, 88], // systemGreen
}
export const FLOW_LABELS: Record<FlowFamily, string> = {
  overlay: 'Links',
  gossip: 'Gossip',
  probe: 'Probes',
  heartbeat: 'Heartbeats',
}

export const css = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

const WHITE: RGB = [255, 255, 255]
const GRAY: RGB = [161, 161, 161]
const LABEL_FONT = '500 10px "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace'

const JOIN_MS = 3000 // a new node glows blue this long
const POP_MS = 650
const RIPPLE_MS = 1400
const FLASH_MS = 900 // a new link flashes
const BLEND_MS = 600 // colour change after a state change
const EDGE_FADE_MS = 700
const GONE_MS = 1200 // a node that left shrinks and fades
const ORPHAN_HIDE_MS = 4000 // an orphan shows red this long, then fades; the collector keeps it for ~90 s
const TICK_MS = 1000 / 60
const LINK_DISTANCE = 32
const PAD = 96 // screen pixels kept around the graph, less on small screens
const COLLIDE_UP_TO = 1500 // past this many nodes, collisions cost too much per frame
const AUTO_LABELS_UP_TO = 30
const PULSE_MS = 700 // a message travels from sender to receiver this long
const PULSE_SPREAD_MS = 250 // a node counts messages over 250 ms, so its batch is spread back out over that
const PULSE_TAIL = 0.35 // of the line, behind the head
const ARRIVE_MS = 260
const MAX_PULSES = 2500
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

export interface SceneNode extends SimulationNodeDatum {
  id: string
  address: string
  state: NodeState
  component: number
  degree: number
  /** The degree eased over time, so nodes grow and shrink smoothly. */
  size: number
  /** performance.now() when it appeared; back-dated for nodes already there on load. */
  born: number
  /** When it left the collector's graph; 0 while it is in it. */
  gone: number
  /** When its colour started blending from `from` to its state's colour. */
  changed: number
  from: RGB
  phase: number
}

interface Pulse {
  from: SceneNode
  to: SceneNode
  family: FlowFamily
  count: number
  start: number
}

interface SceneEdge extends SimulationLinkDatum<SceneNode> {
  key: string
  source: SceneNode
  target: SceneNode
  born: number
  gone: number
}

export interface SceneEvent {
  kind: 'join' | 'leave' | 'orphan' | 'isolate' | 'link' | 'split' | 'merge' | 'info'
  id?: string
  text: string
}

/** What to emphasise: hover is a light touch, a selection dims everything else. */
export interface Focus {
  hover: string | null
  selected: string | null
}

export class Scene {
  private nodes = new Map<string, SceneNode>()
  private edges = new Map<string, SceneEdge>()
  private sim: Simulation<SceneNode, SceneEdge>
  private links: ForceLink<SceneNode, SceneEdge>
  // Layout spacing, kept apart from the drawn size so bigger dots don't spread the graph out.
  private collide = forceCollide<SceneNode>().radius((n) => 3 + 1.3 * Math.sqrt(n.degree))
  private synced = false
  private parts = 0
  private width = 0
  private height = 0
  private cam = { x: 0, y: 0, k: 1, ready: false }
  private goal = { x: 0, y: 0, k: 1 }
  private follow = true
  private dragged: SceneNode | null = null
  private last = 0
  private lag = 0
  private drift = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.03
  private allLabels = false
  private pulses: Pulse[] = []
  private families = new Set<FlowFamily>()
  private listed = new Set<string>()

  constructor() {
    this.links = forceLink<SceneNode, SceneEdge>().distance(LINK_DISTANCE)
    this.sim = forceSimulation<SceneNode, SceneEdge>()
      .force('charge', forceManyBody<SceneNode>().strength(-70).distanceMax(500))
      .force('link', this.links)
      // Nodes without links are only pushed away, so pull them in harder.
      .force('x', forceX<SceneNode>().strength(pull))
      .force('y', forceY<SceneNode>().strength(pull))
      .velocityDecay(0.35)
      .alphaTarget(0.02) // never quite settles, so the graph keeps floating
      .stop()
  }

  /** Brings the scene to graph g and returns what changed, for the activity feed. */
  sync(g: Graph, now: number): SceneEvent[] {
    const first = !this.synced
    this.synced = true
    const events: SceneEvent[] = []
    let moved = false
    let restyled = false

    for (const n of g.nodes.values()) {
      const v = this.nodes.get(n.id)
      if (!v) {
        this.nodes.set(n.id, this.spawn(n, g, now, first))
        moved = true
        if (!first) events.push({ kind: 'join', id: n.id, text: `joined from ${n.address}` })
        continue
      }
      if (v.gone && !(v.state === 'orphaned' && n.state === 'orphaned')) {
        v.gone = 0
        moved = true
      }
      if (v.state !== n.state || v.component !== n.component) {
        const e = transition(v, n, now)
        if (e) events.push(e)
        v.from = colorOf(v, now)
        v.changed = now
        restyled = true
      }
      v.address = n.address
      v.state = n.state
      v.component = n.component
    }
    this.listed = new Set(g.nodes.keys())
    for (const v of this.nodes.values()) {
      if (v.gone || g.nodes.has(v.id)) continue
      v.gone = now
      moved = true
      events.push({ kind: 'leave', id: v.id, text: v.state === 'orphaned' ? 'dropped by the collector' : 'left' })
    }

    for (const [key, [a, b]] of g.edges) {
      if (this.edges.get(key)?.gone === 0) continue
      const source = this.nodes.get(a)
      const target = this.nodes.get(b)
      if (!source || !target) continue
      this.edges.set(key, { key, source, target, born: first ? now - FLASH_MS : now, gone: 0 })
      moved = true
    }
    for (const e of this.edges.values()) {
      if (e.gone || g.edges.has(e.key)) continue
      e.gone = now
      moved = true
    }
    for (const v of this.nodes.values()) v.degree = g.adj.get(v.id)?.length ?? 0

    // Active nodes have links, so each of their components has two or more nodes.
    const parts = new Set([...g.nodes.values()].filter((n) => n.state === 'active').map((n) => n.component)).size
    if (first) {
      if (g.nodes.size) events.push({ kind: 'info', text: `${g.nodes.size} node${g.nodes.size === 1 ? '' : 's'} reporting` })
    } else if (parts > this.parts && this.parts > 0) {
      events.push({ kind: 'split', text: `overlay split into ${parts} components` })
    } else if (parts < this.parts && parts > 0) {
      events.push({ kind: 'merge', text: parts === 1 ? 'overlay is one component again' : `overlay down to ${parts} components` })
    }
    this.parts = parts

    if (moved || restyled) {
      this.relayout(first ? 1 : moved ? 0.25 : 0.1)
      if (first) this.sim.tick(Math.round(clamp(60_000 / Math.max(g.nodes.size, 1), 20, 300)))
    }
    return events
  }

  /** Hands the simulation the nodes and links still drawn; this also re-reads each node's pull and collision size. */
  private relayout(alpha: number) {
    const live = [...this.nodes.values()].filter((v) => !v.gone)
    this.sim.force('collide', live.length <= COLLIDE_UP_TO ? this.collide : null)
    this.sim.nodes(live)
    this.links.links([...this.edges.values()].filter((e) => !e.gone && !e.source.gone && !e.target.gone))
    this.sim.alpha(Math.max(this.sim.alpha(), alpha))
  }

  /** Advances the layout and camera to time now (performance.now()). */
  step(now: number) {
    const dt = this.last ? Math.min(now - this.last, 250) : TICK_MS
    this.last = now
    // At most one tick per frame: on a slow frame the layout slows down instead of piling up work.
    this.lag = Math.min(this.lag + dt, TICK_MS * 2)
    if (this.lag >= TICK_MS) {
      this.lag -= TICK_MS
      for (const v of this.sim.nodes()) {
        const t = now / 2400 + v.phase
        v.vx = (v.vx ?? 0) + Math.cos(t * 1.3) * this.drift
        v.vy = (v.vy ?? 0) + Math.sin(t * 1.7) * this.drift
      }
      this.sim.tick()
    }
    const ease = 1 - Math.exp(-dt / 400)
    for (const v of this.nodes.values()) v.size += (v.degree - v.size) * ease
    // An orphan fades out long before the collector drops it; it stays here, hidden, until then.
    let hid = false
    for (const v of this.nodes.values()) {
      if (v.state === 'orphaned' && !v.gone && now - v.changed > ORPHAN_HIDE_MS) {
        v.gone = now
        hid = true
      }
    }
    if (hid) this.relayout(0.1)
    for (const [id, v] of this.nodes) {
      if (v.gone && now - v.gone > GONE_MS && !(v.state === 'orphaned' && this.listed.has(id))) this.nodes.delete(id)
    }
    for (const [key, e] of this.edges) if (e.gone && now - e.gone > EDGE_FADE_MS) this.edges.delete(key)
    if (this.pulses.length) this.pulses = this.pulses.filter((p) => now - p.start < PULSE_MS + ARRIVE_MS)
    this.moveCamera(dt)
  }

  /** Starts a pulse from sender to receiver for each flow in a family being shown. */
  pulse(flows: FlowEvent[], now: number) {
    for (const f of flows) {
      if (this.pulses.length >= MAX_PULSES) return
      const family = familyOf(f.kind)
      if (!this.families.has(family)) continue
      const from = this.nodes.get(f.from)
      const to = this.nodes.get(f.to)
      if (!from || !to || from.gone || to.gone) continue
      this.pulses.push({ from, to, family, count: f.count, start: now + Math.random() * PULSE_SPREAD_MS })
    }
  }

  /** The message families drawn as pulses; the rest are ignored as they arrive. */
  showFlows(families: Iterable<FlowFamily>) {
    this.families = new Set(families)
    this.pulses = this.pulses.filter((p) => this.families.has(p.family))
  }

  /** Labels every node, not only small graphs and the focused ones. */
  showAllLabels(on: boolean) {
    this.allLabels = on
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
  }

  // Camera. It follows the whole graph until panned or zoomed; fit() resumes that.

  get following() {
    return this.follow
  }

  fit() {
    this.follow = true
  }

  panBy(dx: number, dy: number) {
    this.follow = false
    this.cam.x -= dx / this.cam.k
    this.cam.y -= dy / this.cam.k
    this.goal = { x: this.cam.x, y: this.cam.y, k: this.cam.k }
  }

  /** Zooms by factor around screen point (px, py), the centre by default. */
  zoomAt(factor: number, px = this.width / 2, py = this.height / 2) {
    this.follow = false
    const { x, y, k } = this.goal
    const next = clamp(k * factor, MIN_ZOOM, MAX_ZOOM)
    const dx = px - this.width / 2
    const dy = py - this.height / 2
    this.goal = { x: x + dx / k - dx / next, y: y + dy / k - dy / next, k: next }
  }

  /** Eases the camera onto a node, zooming in if it is far out. */
  focusOn(id: string) {
    const v = this.nodes.get(id)
    if (!v || v.gone) return
    this.follow = false
    this.goal = { x: v.x ?? 0, y: v.y ?? 0, k: Math.max(this.goal.k, 1.6) }
  }

  // Dragging a node pins it under the pointer; its links pull the rest along.

  grab(id: string) {
    const v = this.nodes.get(id)
    if (!v || v.gone) return
    this.dragged = v
    v.fx = v.x
    v.fy = v.y
    this.sim.alphaTarget(0.12)
  }

  dragTo(px: number, py: number) {
    if (!this.dragged) return
    this.dragged.fx = (px - this.width / 2) / this.cam.k + this.cam.x
    this.dragged.fy = (py - this.height / 2) / this.cam.k + this.cam.y
  }

  release() {
    if (!this.dragged) return
    this.dragged.fx = null
    this.dragged.fy = null
    this.dragged = null
    this.sim.alphaTarget(0.02)
  }

  /** The id of the node drawn at screen point (px, py), if any. */
  pick(px: number, py: number): string | null {
    const zoom = this.zoom()
    let best: string | null = null
    let bestD = Infinity
    for (const v of this.nodes.values()) {
      if (v.gone) continue
      const d = Math.hypot(this.sx(v.x) - px, this.sy(v.y) - py)
      if (d < radius(v.size) * zoom + 6 && d < bestD) {
        best = v.id
        bestD = d
      }
    }
    return best
  }

  draw(ctx: CanvasRenderingContext2D, now: number, focus: Focus) {
    const { width: w, height: h } = this
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    this.drawGrid(ctx)

    const sx = (x?: number) => this.sx(x)
    const sy = (y?: number) => this.sy(y)
    const dense = this.nodes.size > 300
    const zoom = this.zoom()
    const selected = focus.selected ? this.nodes.get(focus.selected) : undefined
    const hover = focus.hover && focus.hover !== focus.selected ? this.nodes.get(focus.hover) : undefined
    const near = new Set<SceneNode>()
    const hoverNear = new Set<SceneNode>()
    for (const e of this.edges.values()) {
      if (e.gone) continue
      if (e.source === selected) near.add(e.target)
      if (e.target === selected) near.add(e.source)
      if (e.source === hover) hoverNear.add(e.target)
      if (e.target === hover) hoverNear.add(e.source)
    }

    // Settled links go in one path; new, fading and focused ones one by one.
    const base = (dense ? 0.08 : 0.16) * (selected ? 0.4 : 1)
    const width = dense ? 0.6 : 1
    const busy: SceneEdge[] = []
    ctx.strokeStyle = rgba(WHITE, base)
    ctx.lineWidth = width
    ctx.beginPath()
    for (const e of this.edges.values()) {
      const touches = e.source === selected || e.target === selected || e.source === hover || e.target === hover
      if (e.gone || now - e.born < FLASH_MS || touches) {
        busy.push(e)
        continue
      }
      ctx.moveTo(sx(e.source.x), sy(e.source.y))
      ctx.lineTo(sx(e.target.x), sy(e.target.y))
    }
    ctx.stroke()
    for (const e of busy) {
      let a = clamp((now - e.born) / 400, 0, 1)
      if (e.gone) a *= clamp(1 - (now - e.gone) / EDGE_FADE_MS, 0, 1)
      const flash = e.gone ? 0 : clamp(1 - (now - e.born) / FLASH_MS, 0, 1)
      let color = mix(WHITE, PALETTE.join, flash)
      let alpha = Math.min(1, base + flash * 0.7)
      let lw = width + flash
      if (!e.gone && (e.source === selected || e.target === selected)) {
        color = WHITE
        alpha = 0.75
        lw = 1.5
      } else if (!e.gone && (e.source === hover || e.target === hover)) {
        color = WHITE
        alpha = Math.max(alpha, 0.4)
        lw = 1.2
      }
      ctx.strokeStyle = rgba(color, alpha * a)
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(sx(e.source.x), sy(e.source.y))
      ctx.lineTo(sx(e.target.x), sy(e.target.y))
      ctx.stroke()
    }

    this.drawPulses(ctx, now, selected)

    ctx.font = LABEL_FONT
    ctx.textAlign = 'center'
    const autoLabels = this.allLabels || this.nodes.size <= AUTO_LABELS_UP_TO
    for (const v of this.nodes.values()) {
      const x = sx(v.x)
      const y = sy(v.y)
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue
      const age = now - v.born
      const size = v.gone ? clamp(1 - (now - v.gone) / GONE_MS, 0, 1) : easeOutBack(clamp(age / POP_MS, 0, 1))
      const r = radius(v.size) * zoom * size
      if (r < 0.2) continue

      const lit = v === selected || v === hover || near.has(v) || hoverNear.has(v)
      let a = v.gone ? size : 1
      if (selected && !lit) a *= 0.25
      const c = colorOf(v, now)

      if (!dense) circle(ctx, x, y, r * 1.8 + 2, rgba(c, (v.state === 'active' ? 0.05 : 0.12) * a))
      circle(ctx, x, y, r, rgba(c, 0.95 * a))
      if (v.state === 'isolated' && !v.gone) {
        ctx.setLineDash([2, 3])
        ring(ctx, x, y, r + 4, rgba(PALETTE.isolated, 0.9 * a), 1.2)
        ctx.setLineDash([])
      }
      if (v.state === 'orphaned' && now - v.changed < RIPPLE_MS) {
        const t = (now - v.changed) / RIPPLE_MS
        ring(ctx, x, y, r + 4 + t * 34, rgba(PALETTE.orphaned, (1 - t) * 0.9), 1.6)
      }
      if (age < RIPPLE_MS && !v.gone) {
        const t = age / RIPPLE_MS
        ring(ctx, x, y, r + 4 + t * 44, rgba(PALETTE.join, (1 - t) * 0.8), 1.5)
      }
      if (v === selected) {
        ring(ctx, x, y, r + 10, rgba(PALETTE.join, 0.3), 4)
        ring(ctx, x, y, r + 5, rgba(WHITE, 0.95), 1.5)
      } else if (v === hover) {
        ring(ctx, x, y, r + 5, rgba(WHITE, 0.5), 1.2)
      }
      const label = v === selected || v === hover || (selected ? near.has(v) : autoLabels)
      if (label && !v.gone) {
        ctx.fillStyle = rgba(v === selected || v === hover ? WHITE : GRAY, 0.85 * a)
        ctx.fillText(v.id.slice(0, 6), x, y + r + 14)
      }
    }

    // A soft vignette keeps the panels readable over the graph.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, w, h)
  }

  /**
   * Each message is a comet running from sender to receiver: a bright head with
   * a fading tail behind it, so the direction reads at a glance, then a small
   * ring where it lands. With a node selected, only its own messages stay bright.
   */
  private drawPulses(ctx: CanvasRenderingContext2D, now: number, selected?: SceneNode) {
    if (!this.pulses.length) return
    const zoom = this.zoom()
    ctx.lineCap = 'round'
    for (const p of this.pulses) {
      const t = (now - p.start) / PULSE_MS
      if (t < 0) continue
      const x0 = this.sx(p.from.x)
      const y0 = this.sy(p.from.y)
      const x1 = this.sx(p.to.x)
      const y1 = this.sy(p.to.y)
      const c = FLOW_COLORS[p.family]
      const dim = selected && p.from !== selected && p.to !== selected ? 0.15 : 1
      const weight = 1 + Math.log2(1 + p.count) * 0.5

      if (t <= 1) {
        const head = easeInOut(t)
        const tail = Math.max(0, head - PULSE_TAIL)
        const hx = x0 + (x1 - x0) * head
        const hy = y0 + (y1 - y0) * head
        const tx = x0 + (x1 - x0) * tail
        const ty = y0 + (y1 - y0) * tail
        ctx.strokeStyle = rgba(c, 0.12 * dim)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
        const grad = ctx.createLinearGradient(tx, ty, hx, hy)
        grad.addColorStop(0, rgba(c, 0))
        grad.addColorStop(1, rgba(c, 0.9 * dim))
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6 * weight * zoom
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(hx, hy)
        ctx.stroke()
        circle(ctx, hx, hy, 1.8 * weight * zoom, rgba(mix(c, WHITE, 0.4), dim))
      } else {
        const a = (now - p.start - PULSE_MS) / ARRIVE_MS
        ring(ctx, x1, y1, radius(p.to.size) * zoom + 2 + a * 8, rgba(c, (1 - a) * 0.8 * dim), 1.2)
      }
    }
    ctx.lineCap = 'butt'
  }

  /** A dot grid that moves and scales with the camera, about 24 to 48 px apart. */
  private drawGrid(ctx: CanvasRenderingContext2D) {
    let step = 32
    while (step * this.cam.k < 24) step *= 2
    while (step * this.cam.k > 48) step /= 2
    const s = step * this.cam.k
    const ox = (((this.width / 2 - this.cam.x * this.cam.k) % s) + s) % s
    const oy = (((this.height / 2 - this.cam.y * this.cam.k) % s) + s) % s
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
    for (let x = ox; x < this.width; x += s) for (let y = oy; y < this.height; y += s) ctx.fillRect(x - 0.5, y - 0.5, 1, 1)
  }

  private spawn(n: CollectorNode, g: Graph, now: number, first: boolean): SceneNode {
    let peer: SceneNode | undefined
    for (const id of g.adj.get(n.id) ?? []) {
      const p = this.nodes.get(id)
      if (p && !p.gone && p.x !== undefined) {
        peer = p
        break
      }
    }
    const angle = Math.random() * Math.PI * 2
    let x: number
    let y: number
    if (peer) {
      // next to a peer it already links to
      x = (peer.x ?? 0) + Math.cos(angle) * LINK_DISTANCE * 0.6
      y = (peer.y ?? 0) + Math.sin(angle) * LINK_DISTANCE * 0.6
    } else {
      // on load, scattered; later, at the rim, so it drifts in
      const r = first ? Math.sqrt(Math.random() * g.nodes.size) * LINK_DISTANCE : this.extent() + LINK_DISTANCE
      x = Math.cos(angle) * r
      y = Math.sin(angle) * r
    }
    const back = first ? JOIN_MS : 0 // nodes already there on load do not pop in
    const degree = g.adj.get(n.id)?.length ?? 0
    return {
      id: n.id,
      address: n.address,
      state: n.state,
      component: n.component,
      degree,
      size: degree,
      born: now - back,
      gone: 0,
      changed: now - back,
      from: stateColor(n.state, n.component),
      phase: Math.random() * 1000,
      x,
      y,
      vx: 0,
      vy: 0,
    }
  }

  private extent() {
    let r = 0
    for (const v of this.nodes.values()) if (!v.gone) r = Math.max(r, Math.hypot(v.x ?? 0, v.y ?? 0))
    return r
  }

  /** The camera that fits every node still in the graph, or null if there are none. */
  private fitView() {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const v of this.nodes.values()) {
      if (v.gone) continue
      minX = Math.min(minX, v.x ?? 0)
      minY = Math.min(minY, v.y ?? 0)
      maxX = Math.max(maxX, v.x ?? 0)
      maxY = Math.max(maxY, v.y ?? 0)
    }
    if (minX === Infinity || !this.width || !this.height) return null
    const pad = Math.min(PAD, Math.min(this.width, this.height) * 0.12)
    const k = clamp(
      Math.min((this.width - 2 * pad) / Math.max(maxX - minX, 1), (this.height - 2 * pad) / Math.max(maxY - minY, 1)),
      MIN_ZOOM,
      3,
    )
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, k }
  }

  private moveCamera(dt: number) {
    if (this.follow && !this.dragged) {
      const fit = this.fitView()
      if (!fit) return
      this.goal = fit
      if (!this.cam.ready) {
        this.cam = { ...fit, ready: true }
        return
      }
    }
    const s = 1 - Math.exp(-dt / (this.follow ? 600 : 140))
    this.cam.x += (this.goal.x - this.cam.x) * s
    this.cam.y += (this.goal.y - this.cam.y) * s
    this.cam.k = Math.exp(Math.log(this.cam.k) + (Math.log(this.goal.k) - Math.log(this.cam.k)) * s)
  }

  private sx(x = 0) {
    return (x - this.cam.x) * this.cam.k + this.width / 2
  }

  private sy(y = 0) {
    return (y - this.cam.y) * this.cam.k + this.height / 2
  }

  /** How much node sizes follow the camera's zoom. */
  private zoom() {
    return clamp(Math.sqrt(this.cam.k), 0.45, 1.3)
  }
}

function transition(v: SceneNode, n: CollectorNode, now: number): SceneEvent | null {
  if (v.state === n.state) return null // a component relabel, not news by itself
  if (n.state === 'orphaned') return { kind: 'orphan', id: n.id, text: 'presumed dead' }
  if (n.state === 'isolated') return { kind: 'isolate', id: n.id, text: 'lost all its links' }
  if (v.state === 'orphaned') return { kind: 'link', id: n.id, text: 'back from orphaned' }
  // isolated to active just after joining is the join finishing
  return now - v.born < 10_000 ? null : { kind: 'link', id: n.id, text: 'linked again' }
}

function pull(n: SceneNode) {
  return n.state === 'orphaned' ? 0.12 : n.state === 'isolated' ? 0.06 : 0.03
}

export function stateColor(state: NodeState, component: number): RGB {
  if (state === 'orphaned') return PALETTE.orphaned
  if (state === 'isolated') return PALETTE.isolated
  if (component <= 0) return PALETTE.node
  return PALETTE.components[(component - 1) % PALETTE.components.length]
}

function colorOf(v: SceneNode, now: number): RGB {
  const c = mix(v.from, stateColor(v.state, v.component), clamp((now - v.changed) / BLEND_MS, 0, 1))
  const join = clamp(1 - (now - v.born) / JOIN_MS, 0, 1)
  return join > 0 ? mix(c, PALETTE.join, join) : c
}

/** A node's drawn radius in pixels, before following the zoom. */
const radius = (degree: number) => 3.5 + 2.2 * Math.sqrt(degree)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${Math.max(0, a).toFixed(3)})`
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stroke: string, width: number) {
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}
