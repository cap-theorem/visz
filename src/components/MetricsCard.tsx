import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMemo } from 'react'
import type { Graph, Summary } from '../collector'
import type { GapSample } from '../live'
import { graphStats, useNow } from '../lib'
import { css, PALETTE } from '../scene'
import { GapChart } from './GapChart'
import { Num } from './Num'

interface Props {
  graph: Graph | null
  summary: Summary | null
  gaps: GapSample[]
}

const LEGEND = [
  ['Node', PALETTE.node],
  ['Joining', PALETTE.join],
  ['Isolated', PALETTE.isolated],
  ['Orphaned', PALETTE.orphaned],
  ['Split off', PALETTE.components[0]],
] as const

export function MetricsCard({ graph, summary, gaps }: Props) {
  const stats = useMemo(() => (graph ? graphStats(graph) : null), [graph])
  const now = useNow(1000)

  if (!graph || !stats) {
    return (
      <section className="glass metrics" aria-busy="true" aria-label="Overlay metrics">
        <div className="skeleton wide" />
        <div className="skeleton hero" />
        <div className="skeleton chart-block" />
      </section>
    )
  }

  // λ₂ now against a minute ago
  const before = [...gaps].reverse().find((s) => s.at <= now - 60_000) ?? gaps[0]
  const change = before ? graph.gap - before.gap : 0
  const oneSided = summary?.one_sided_links ?? 0

  return (
    <section className="glass metrics" aria-label="Overlay metrics">
      <div className="eyebrow">
        <span>Spectral gap</span>
        <span
          className="hint-chip"
          tabIndex={0}
          data-tip="λ₂ of the normalized Laplacian on the largest component: higher is better connected, 0 is split"
          data-tip-at="below"
        >
          λ₂
        </span>
      </div>
      <div className="hero">
        <Num value={graph.gap} digits={3} className="hero-number" />
        {Math.abs(change) >= 0.0005 && (
          <span className={change > 0 ? 'delta up' : 'delta down'} title="change over the last minute">
            {change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change).toFixed(3)}
          </span>
        )}
      </div>
      {!graph.gapConverged && <p className="note">The estimate did not converge.</p>}
      <GapChart samples={gaps} />

      <dl className="stats">
        <Stat label="Nodes" value={stats.nodes} />
        <Stat label="Links" value={stats.edges} />
        <Stat label="Avg degree" value={stats.degreeMean} digits={1} hint={`${stats.degreeMin}–${stats.degreeMax}`} />
        <Stat label="Components" value={stats.components} hint={stats.components > 1 ? `largest ${stats.largest}` : undefined} />
      </dl>

      {(stats.orphaned > 0 || stats.isolated > 0 || oneSided > 0) && (
        <div className="pills">
          {stats.orphaned > 0 && <span className="pill red">{stats.orphaned} orphaned</span>}
          {stats.isolated > 0 && <span className="pill orange">{stats.isolated} isolated</span>}
          {oneSided > 0 && <span className="pill">{oneSided} one-sided</span>}
        </div>
      )}

      <ul className="legend" aria-label="Legend">
        {LEGEND.map(([label, color]) => (
          <li key={label}>
            <i style={{ background: css(color) }} />
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({ label, value, digits = 0, hint }: { label: string; value: number; digits?: number; hint?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <Num value={value} digits={digits} />
        {hint && <span className="stat-hint">{hint}</span>}
      </dd>
    </div>
  )
}
