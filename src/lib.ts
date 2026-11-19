import { useEffect, useState } from 'react'
import type { Graph } from './collector'

/** The key that goes with K for the command menu. */
export const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl '

/** Date.now(), refreshed every `every` ms. */
export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(timer)
  }, [every])
  return now
}

/** "now", "12s", "3m", "2h". */
export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 2) return 'now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

/** Whether a key press belongs to a text field rather than to the page. */
export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
  )
}

export interface GraphStats {
  /** Not counting orphaned nodes, like the collector's summary. */
  nodes: number
  isolated: number
  orphaned: number
  edges: number
  components: number
  largest: number
  degreeMin: number
  degreeMax: number
  degreeMean: number
}

/** The collector's summary, from the graph itself so it always matches the picture. */
export function graphStats(g: Graph): GraphStats {
  let nodes = 0
  let isolated = 0
  let orphaned = 0
  let degreeMin = Infinity
  let degreeMax = 0
  let degreeSum = 0
  const sizes = new Map<number, number>()
  for (const n of g.nodes.values()) {
    if (n.state === 'orphaned') {
      orphaned++
      continue
    }
    nodes++
    if (n.state === 'isolated') isolated++
    sizes.set(n.component, (sizes.get(n.component) ?? 0) + 1)
    const d = g.adj.get(n.id)?.length ?? 0
    degreeMin = Math.min(degreeMin, d)
    degreeMax = Math.max(degreeMax, d)
    degreeSum += d
  }
  return {
    nodes,
    isolated,
    orphaned,
    edges: g.edges.size,
    components: sizes.size,
    largest: Math.max(0, ...sizes.values()),
    degreeMin: nodes ? degreeMin : 0,
    degreeMax,
    degreeMean: nodes ? degreeSum / nodes : 0,
  }
}
