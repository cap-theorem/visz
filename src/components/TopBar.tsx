import { Keyboard, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Status } from '../live'
import { ago, MOD, useNow } from '../lib'
import { IconButton } from './ui'

const STATUS: Record<Status, string> = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  unreachable: 'Offline',
}

interface Props {
  collector: string
  status: Status
  version?: number
  updatedAt: number
  connectionOpen: boolean
  onConnectionOpen: (open: boolean) => void
  onCollectorChange: (url: string) => void
  onSearch: () => void
  onHelp: () => void
}

export function TopBar(props: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="name">visz</span>
        <span className="slash">/</span>
        <span className="context">spectral overlay</span>
      </div>
      <Connection {...props} />
      <div className="actions">
        <button type="button" className="search-trigger" onClick={props.onSearch}>
          <Search size={14} />
          <span>Search nodes</span>
          <kbd>{MOD}K</kbd>
        </button>
        <IconButton label="Keyboard shortcuts" shortcut="?" tip="below" onClick={props.onHelp}>
          <Keyboard size={16} />
        </IconButton>
      </div>
    </header>
  )
}

function Connection({ collector, status, version, updatedAt, connectionOpen: open, onConnectionOpen, onCollectorChange }: Props) {
  const [draft, setDraft] = useState(collector)
  const box = useRef<HTMLDivElement>(null)
  const now = useNow(1000)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onConnectionOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open, onConnectionOpen])

  const host = collector.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  return (
    <div className="connection" ref={box}>
      <button
        type="button"
        className={`connection-pill ${status}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(collector)
          onConnectionOpen(!open)
        }}
      >
        <span className="status-dot" aria-hidden />
        <span className="status-label">{STATUS[status]}</span>
        <span className="divider" aria-hidden />
        <span className="mono host">{host}</span>
        {status === 'live' && version !== undefined && <span className="mono faint">v{version}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            className="glass popover"
            role="dialog"
            aria-label="Collector"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) onCollectorChange(draft.trim())
              onConnectionOpen(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                onConnectionOpen(false)
              }
            }}
          >
            <label htmlFor="collector-url">Collector URL</label>
            <div className="field">
              <input
                id="collector-url"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="button primary">
                Connect
              </button>
            </div>
            <p className="faint">
              {updatedAt ? `Graph last changed ${ago(now - updatedAt)} ago.` : 'No graph yet.'} Remembered in this browser.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7 19 5 12 19Z M19 5l2 10-9 4" fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.4" />
      <circle cx="5" cy="7" r="2.5" fill="currentColor" />
      <circle cx="19" cy="5" r="2.5" fill="currentColor" />
      <circle cx="12" cy="19" r="2.5" fill="currentColor" />
      <circle cx="21" cy="15" r="2" fill="#0a84ff" />
    </svg>
  )
}
