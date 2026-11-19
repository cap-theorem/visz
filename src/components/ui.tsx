import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { NodeState } from '../collector'
import { css, stateColor } from '../scene'

interface IconButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  /** Where the tooltip opens; above by default. */
  tip?: 'above' | 'below' | 'left'
  onClick: () => void
  children: ReactNode
}

export function IconButton({ label, shortcut, active, tip = 'above', onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'icon-button active' : 'icon-button'}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      data-tip-key={shortcut}
      data-tip-at={tip}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function StateDot({ state, component = 0 }: { state: NodeState; component?: number }) {
  return <span className="state-dot" style={{ background: css(stateColor(state, component)) }} aria-hidden />
}

const STATE_LABEL: Record<NodeState, string> = { active: 'Active', isolated: 'Isolated', orphaned: 'Orphaned' }

export function StateBadge({ state, component = 0 }: { state: NodeState; component?: number }) {
  return (
    <span className={`badge ${state}`}>
      <StateDot state={state} component={component} />
      {STATE_LABEL[state]}
    </span>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="icon-button small"
      aria-label={`Copy ${label}`}
      data-tip={copied ? 'Copied' : `Copy ${label}`}
      data-tip-at="above"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}
