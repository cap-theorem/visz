// The read API of the spectral topology collector (cmd/collector in
// cap-theorem/spectral): GET /v1/graph/stream sends one snapshot, then one
// delta per change; GET /v1/summary has the latest analysis.

export type NodeState = 'active' | 'isolated' | 'orphaned'

export interface CollectorNode {
  id: string
  address: string
  /** active, isolated (reports no links) or orphaned (presumed dead, kept until its reports expire). */
  state: NodeState
  /** 0 is the largest component; -1 if orphaned. */
  component: number
}

export interface Snapshot {
  version: number
  computed_at: string
  gap: number
  gap_converged: boolean
  nodes: CollectorNode[]
  /** Index pairs into nodes; null when there are none. */
  edges: [number, number][] | null
}

/** Turns the snapshot of version - 1 into the snapshot of version. */
export interface Delta {
  version: number
  computed_at: string
  gap: number
  gap_converged: boolean
  /** Added or changed. */
  nodes?: CollectorNode[]
  removed?: string[]
  edges_added?: [string, string][]
  edges_removed?: [string, string][]
}

export interface Summary {
  version: number
  computed_at: string
  /** Not counting orphaned nodes. */
  nodes: number
  edges: number
  one_sided_links: number
  components: number
  largest_component: number
  isolated: number
  orphaned: number
  degree_min: number
  degree_mean: number
  degree_max: number
  gap: number
  gap_converged: boolean
  analysis_seconds: number
}

/** The collector's graph at one version. Never mutated: each change makes a new one. */
export interface Graph {
  version: number
  /** λ₂ of the normalized Laplacian on the largest component. */
  gap: number
  gapConverged: boolean
  nodes: Map<string, CollectorNode>
  /** Keyed by edgeKey. An edge exists only if both ends report the link. */
  edges: Map<string, [string, string]>
  /** Neighbours of every node, derived from edges. */
  adj: Map<string, string[]>
}

export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function fromSnapshot(s: Snapshot): Graph {
  const nodes = new Map(s.nodes.map((n) => [n.id, n]))
  const edges = new Map<string, [string, string]>()
  for (const [i, j] of s.edges ?? []) {
    const a = s.nodes[i].id
    const b = s.nodes[j].id
    edges.set(edgeKey(a, b), [a, b])
  }
  return { version: s.version, gap: s.gap, gapConverged: s.gap_converged, nodes, edges, adj: adjacency(edges) }
}

export function applyDelta(g: Graph, d: Delta): Graph {
  const nodes = new Map(g.nodes)
  const edges = new Map(g.edges)
  for (const n of d.nodes ?? []) nodes.set(n.id, n)
  for (const id of d.removed ?? []) nodes.delete(id)
  for (const [a, b] of d.edges_removed ?? []) edges.delete(edgeKey(a, b))
  for (const [a, b] of d.edges_added ?? []) edges.set(edgeKey(a, b), [a, b])
  return { version: d.version, gap: d.gap, gapConverged: d.gap_converged, nodes, edges, adj: adjacency(edges) }
}

function adjacency(edges: Map<string, [string, string]>) {
  const adj = new Map<string, string[]>()
  const add = (from: string, to: string) => {
    const list = adj.get(from)
    if (list) list.push(to)
    else adj.set(from, [to])
  }
  for (const [a, b] of edges.values()) {
    add(a, b)
    add(b, a)
  }
  return adj
}

export const apiUrl = (base: string, path: string) => base.replace(/\/+$/, '') + path

/** One sender's messages of one kind to one peer, counted over the sender's last 250 ms. */
export interface FlowEvent {
  from: string
  to: string
  kind: string
  count: number
}

/** What GET /v1/flows/stream sends about every 100 ms while messages flow. */
export interface FlowBatch {
  at: string
  flows: FlowEvent[]
}

export type FlowFamily = 'heartbeat' | 'overlay' | 'gossip' | 'probe'

export const FLOW_FAMILIES: FlowFamily[] = ['overlay', 'gossip', 'probe', 'heartbeat']

export function familyOf(kind: string): FlowFamily {
  switch (kind) {
    case 'heartbeat':
      return 'heartbeat'
    case 'link':
    case 'link_ack':
    case 'unlink':
      return 'overlay'
    case 'update':
    case 'ae_digest':
    case 'ae_heads':
    case 'ae_want':
      return 'gossip'
    default:
      return 'probe'
  }
}
