import {
  apiUrl,
  applyDelta,
  familyOf,
  fromSnapshot,
  type Delta,
  type FlowBatch,
  type FlowFamily,
  type Graph,
  type Snapshot,
  type Summary,
} from './collector'
import { Scene, type SceneEvent } from './scene'

/** unreachable: no graph yet and the last attempt failed. */
export type Status = 'connecting' | 'live' | 'reconnecting' | 'unreachable'

/** Messages per second in each family, over the last second. */
export type FlowRates = Record<FlowFamily, number>
const NO_FLOWS: FlowRates = { overlay: 0, gossip: 0, probe: 0, heartbeat: 0 }

export interface LogEntry extends SceneEvent {
  seq: number
  /** Date.now() when it happened. */
  at: number
}

export interface GapSample {
  at: number
  gap: number
}

export interface LiveState {
  status: Status
  graph: Graph | null
  summary: Summary | null
  log: LogEntry[]
  gaps: GapSample[]
  /** Date.now() of the last graph change; 0 before the first. */
  updatedAt: number
  /** Null until the collector sends a flow, e.g. when it predates /v1/flows/stream. */
  flowRates: FlowRates | null
}

export const GAP_HISTORY_MS = 5 * 60_000
const LOG_SIZE = 60
const SUMMARY_EVERY_MS = 2000
const RATE_EVERY_MS = 1000

/**
 * Follows one collector's graph stream: keeps the latest graph, feeds each one
 * to the scene, and keeps the event log and the gap's history. React reads it
 * through useSyncExternalStore.
 */
export class LiveGraph {
  readonly scene = new Scene()
  private state: LiveState = { status: 'connecting', graph: null, summary: null, log: [], gaps: [], updatedAt: 0, flowRates: null }
  private listeners = new Set<() => void>()
  private source: EventSource | null = null
  private flowSource: EventSource | null = null
  private flowRetry = 0
  private flowBackoff = 1000
  private flowCounts: FlowRates = { ...NO_FLOWS }
  private sawFlows = false
  private rateTimer = 0
  private run: AbortController | null = null
  private retry = 0
  private backoff = 1000
  private seq = 0
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  start() {
    this.stop()
    this.run = new AbortController()
    this.connect()
    this.connectFlows()
    this.rateTimer = window.setInterval(() => this.publishRates(), RATE_EVERY_MS)
    void this.pollSummary(this.run.signal)
  }

  stop() {
    this.run?.abort()
    this.run = null
    this.source?.close()
    this.source = null
    window.clearTimeout(this.retry)
    this.flowSource?.close()
    this.flowSource = null
    window.clearTimeout(this.flowRetry)
    window.clearInterval(this.rateTimer)
  }

  private connect() {
    this.source?.close()
    window.clearTimeout(this.retry)
    const source = new EventSource(apiUrl(this.url, '/v1/graph/stream'))
    this.source = source
    source.addEventListener('snapshot', (e) => this.onSnapshot(JSON.parse(e.data) as Snapshot))
    source.addEventListener('delta', (e) => this.onDelta(JSON.parse(e.data) as Delta))
    source.onopen = () => {
      this.backoff = 1000
    }
    source.onerror = () => {
      if (this.source !== source) return
      this.set({ status: this.state.graph ? 'reconnecting' : 'unreachable' })
      // The browser retries a dropped stream by itself, but gives up after an
      // HTTP error such as the collector's 503 before its first analysis.
      if (source.readyState === EventSource.CLOSED) {
        this.retry = window.setTimeout(() => this.connect(), this.backoff)
        this.backoff = Math.min(this.backoff * 2, 10_000)
      }
    }
  }

  private connectFlows() {
    this.flowSource?.close()
    window.clearTimeout(this.flowRetry)
    const source = new EventSource(apiUrl(this.url, '/v1/flows/stream'))
    this.flowSource = source
    source.addEventListener('flows', (e) => this.onFlows(JSON.parse(e.data) as FlowBatch))
    source.onopen = () => {
      this.flowBackoff = 1000
    }
    source.onerror = () => {
      if (this.flowSource !== source || source.readyState !== EventSource.CLOSED) return
      // An older collector answers 404; keep trying slowly in case it is upgraded.
      this.flowRetry = window.setTimeout(() => this.connectFlows(), this.flowBackoff)
      this.flowBackoff = Math.min(this.flowBackoff * 2, 30_000)
    }
  }

  private onFlows(b: FlowBatch) {
    this.sawFlows = true
    for (const f of b.flows) this.flowCounts[familyOf(f.kind)] += f.count
    this.scene.pulse(b.flows, performance.now())
  }

  private publishRates() {
    if (!this.sawFlows) return
    const rates = { ...this.flowCounts }
    for (const k of Object.keys(rates) as FlowFamily[]) rates[k] = (rates[k] * 1000) / RATE_EVERY_MS
    this.flowCounts = { ...NO_FLOWS }
    this.set({ flowRates: rates })
  }

  private onSnapshot(s: Snapshot) {
    this.update(fromSnapshot(s))
  }

  private onDelta(d: Delta) {
    const g = this.state.graph
    if (!g || d.version !== g.version + 1) {
      this.connect() // missed a delta: start over from a fresh snapshot
      return
    }
    this.update(applyDelta(g, d))
  }

  private update(graph: Graph) {
    const at = Date.now()
    const events = this.scene.sync(graph, performance.now())
    const log = events.length
      ? [...this.state.log, ...events.map((e) => ({ ...e, seq: ++this.seq, at }))].slice(-LOG_SIZE)
      : this.state.log
    const gaps = [...this.state.gaps.filter((p) => at - p.at < GAP_HISTORY_MS), { at, gap: graph.gap }]
    this.set({ status: 'live', graph, log, gaps, updatedAt: at })
  }

  private async pollSummary(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        const res = await fetch(apiUrl(this.url, '/v1/summary'), { signal, cache: 'no-store' })
        if (res.ok) this.set({ summary: (await res.json()) as Summary })
      } catch {
        // unreachable or stopped; the stream's status already says so
      }
      await sleep(SUMMARY_EVERY_MS, signal)
    }
  }

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
