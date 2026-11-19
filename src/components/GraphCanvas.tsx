import { type MouseEvent, useEffect, useRef, useState } from 'react'
import type { Graph } from '../collector'
import type { Focus, Scene } from '../scene'
import { StateDot } from './ui'

/** Camera moves that also keep React's idea of "following" in step. */
export interface Camera {
  fit: () => void
  zoom: (factor: number, px?: number, py?: number) => void
  pan: (dx: number, dy: number) => void
  focus: (id: string) => void
}

interface Props {
  scene: Scene
  graph: Graph | null
  camera: Camera
  selected: string | null
  /** A node hovered elsewhere in the page, such as in the inspector. */
  highlight: string | null
  onSelect: (id: string | null) => void
}

interface Gesture {
  node: string | null
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

interface Hover {
  id: string
  x: number
  y: number
}

/** Runs the scene on one canvas and turns pointer input into panning, zooming, dragging and selection. */
export function GraphCanvas({ scene, graph, camera, selected, highlight, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const focus = useRef<Focus>({ hover: null, selected: null })
  // The pointer over the canvas, and the node last found under it.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const hovered = useRef<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    focus.current = { hover: hover?.id ?? highlight, selected }
  }, [hover, highlight, selected])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene.resize(width, height)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()

    // Nodes drift and the camera moves under a still pointer, so look again now and then.
    let picked = 0
    let frame = requestAnimationFrame(function draw(now) {
      scene.step(now)
      scene.draw(ctx, now, focus.current)
      const p = pointer.current
      if (p && !gesture.current && now - picked > 100) {
        picked = now
        const id = scene.pick(p.x, p.y)
        if (id !== hovered.current) {
          hovered.current = id
          setHover(id ? { id, x: p.x, y: p.y } : null)
        }
      }
      frame = requestAnimationFrame(draw)
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [scene])

  // Trackpads scroll to pan and pinch to zoom; mouse wheels and ⌘-scroll zoom.
  // Listened to natively: React's wheel listener is passive and cannot stop page zoom.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const notch = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy))
      if (e.ctrlKey || e.metaKey || notch) {
        camera.zoom(Math.exp(-dy * (notch ? 0.0015 : 0.01)), e.clientX - r.left, e.clientY - r.top)
      } else {
        camera.pan(-dx, -dy)
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [camera])

  const at = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const endGesture = (select: boolean) => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g) return
    if (g.node && g.moved) scene.release()
    if (select && !g.moved) onSelect(g.node)
  }

  const node = hover && graph ? graph.nodes.get(hover.id) : undefined
  const flipX = hover ? hover.x > window.innerWidth - 240 : false
  const flipY = hover ? hover.y > window.innerHeight - 80 : false

  return (
    <div className="stage">
      <canvas
        ref={canvasRef}
        className={dragging ? 'graph dragging' : hover ? 'graph over-node' : 'graph'}
        aria-label="Live overlay graph"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const { x, y } = at(e)
          e.currentTarget.setPointerCapture(e.pointerId)
          gesture.current = { node: scene.pick(x, y), startX: x, startY: y, x, y, moved: false }
        }}
        onPointerMove={(e) => {
          const { x, y } = at(e)
          pointer.current = { x, y }
          const g = gesture.current
          if (!g) {
            const id = scene.pick(x, y)
            hovered.current = id
            setHover(id ? { id, x, y } : null)
            return
          }
          if (!g.moved && Math.hypot(x - g.startX, y - g.startY) > 3) {
            g.moved = true
            setDragging(true)
            hovered.current = null
            setHover(null)
            if (g.node) scene.grab(g.node)
          }
          if (g.moved) {
            if (g.node) scene.dragTo(x, y)
            else camera.pan(x - g.x, y - g.y)
          }
          g.x = x
          g.y = y
        }}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        onPointerLeave={() => {
          pointer.current = null
          if (gesture.current) return
          hovered.current = null
          setHover(null)
        }}
        onDoubleClick={(e) => {
          const { x, y } = at(e)
          const id = scene.pick(x, y)
          if (id) camera.focus(id)
          else camera.fit()
        }}
      />
      {hover && node && graph && (
        <div
          className="tooltip"
          style={{
            left: hover.x,
            top: hover.y,
            transform: `translate(${flipX ? 'calc(-100% - 14px)' : '14px'}, ${flipY ? 'calc(-100% - 14px)' : '14px'})`,
          }}
        >
          <StateDot state={node.state} component={node.component} />
          <span className="mono strong">{node.service ?? node.id.slice(0, 8)}</span>
          {node.instance && <span className="mono faint">{node.instance}</span>}
          <span className="faint">{node.address}</span>
          <span className="faint">· {graph.adj.get(node.id)?.length ?? 0} links</span>
        </div>
      )}
    </div>
  )
}
