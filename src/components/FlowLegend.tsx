import { FLOW_FAMILIES, type FlowFamily } from '../collector'
import type { FlowRates } from '../live'
import { css, FLOW_COLORS, FLOW_LABELS } from '../scene'

interface Props {
  rates: FlowRates | null
  shown: Set<FlowFamily>
  onToggle: (family: FlowFamily) => void
}

/** The message colours, each a toggle, with how many of each are sent per second. */
export function FlowLegend({ rates, shown, onToggle }: Props) {
  if (!rates) return null
  return (
    <div className="glass flows" role="group" aria-label="Messages">
      <span className="flows-title">Messages</span>
      {FLOW_FAMILIES.map((f) => (
        <button
          key={f}
          type="button"
          className={shown.has(f) ? 'flow-chip on' : 'flow-chip'}
          aria-pressed={shown.has(f)}
          onClick={() => onToggle(f)}
        >
          <span className="flow-swatch" style={{ background: css(FLOW_COLORS[f]), color: css(FLOW_COLORS[f]) }} aria-hidden />
          <span>{FLOW_LABELS[f]}</span>
          <span className="mono faint">{formatRate(rates[f])}</span>
        </button>
      ))}
    </div>
  )
}

function formatRate(r: number) {
  if (r >= 1000) return `${(r / 1000).toFixed(1)}k/s`
  return `${Math.round(r)}/s`
}
