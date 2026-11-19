import { useState } from 'react'
import { GAP_HISTORY_MS, type GapSample } from '../live'
import { ago, useNow } from '../lib'

const WIDTH = 268
const HEIGHT = 56

/** λ₂ since the page opened, up to five minutes, scaled to its own range. Hover to read a value. */
export function GapChart({ samples }: { samples: GapSample[] }) {
  const now = useNow(1000)
  const [hover, setHover] = useState<number | null>(null) // 0 to 1 across the chart
  if (samples.length === 0) return <div className="chart" />

  const start = Math.max(now - GAP_HISTORY_MS, Math.min(samples[0].at, now - 1000))
  const span = now - start
  const values = samples.map((s) => s.gap)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.3, 0.02)
  const y0 = Math.max(0, lo - pad)
  const y1 = hi + pad
  const x = (t: number) => Math.max(0, ((t - start) / span) * WIDTH).toFixed(1)
  const y = (gap: number) => (HEIGHT - 4 - ((gap - y0) / (y1 - y0)) * (HEIGHT - 8)).toFixed(1)

  // Each value holds until the next one, and the last one until now.
  let line = ''
  samples.forEach((s, i) => {
    const until = Math.max(i + 1 < samples.length ? samples[i + 1].at : now, s.at)
    line += `${i ? 'L' : 'M'}${x(s.at)},${y(s.gap)}H${x(until)}`
  })

  let read: GapSample | null = null
  if (hover !== null) {
    const t = start + hover * span
    let i = samples.length - 1
    while (i > 0 && samples[i].at > t) i--
    read = samples[i]
  }

  return (
    <div
      className="chart"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="gap-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line}V${HEIGHT}H${x(samples[0].at)}Z`} fill="url(#gap-fill)" />
        <path d={line} className="line" />
        {hover !== null && <line x1={hover * WIDTH} x2={hover * WIDTH} y1={0} y2={HEIGHT} className="cursor" />}
      </svg>
      {read && hover !== null && (
        <div className="chart-tip" style={{ left: `${Math.min(84, Math.max(16, hover * 100))}%` }}>
          <b>{read.gap.toFixed(3)}</b>
          <span>{read.at >= now - 1500 ? 'now' : `${ago(now - read.at)} ago`}</span>
        </div>
      )}
      <div className="chart-axis" aria-hidden>
        <span>{span < 2000 ? '' : `${ago(span)} ago`}</span>
        <span>now</span>
      </div>
    </div>
  )
}
