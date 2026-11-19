import { ChevronDown, CirclePlus, CircleX, GitFork, GitMerge, Info, Link, LogOut, Unlink, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ago, useNow } from '../lib'
import type { LogEntry } from '../live'

const ICON: Record<LogEntry['kind'], [LucideIcon, string]> = {
  join: [CirclePlus, 'blue'],
  leave: [LogOut, 'gray'],
  orphan: [CircleX, 'red'],
  isolate: [Unlink, 'orange'],
  link: [Link, 'green'],
  split: [GitFork, 'red'],
  merge: [GitMerge, 'green'],
  info: [Info, 'gray'],
}

interface Props {
  entries: LogEntry[]
  onSelect: (id: string) => void
  onHighlight: (id: string | null) => void
}

export function ActivityFeed({ entries, onSelect, onHighlight }: Props) {
  const [open, setOpen] = useState(true)
  const now = useNow(1000)
  if (entries.length === 0) return null
  const shown = entries.slice(-6).reverse()

  return (
    <section className="glass feed" aria-label="Activity">
      <button type="button" className="feed-header" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="live-dot" aria-hidden />
        <span>Activity</span>
        <span className="faint">{entries.length}</span>
        <ChevronDown size={14} className={open ? 'chevron' : 'chevron closed'} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onPointerLeave={() => onHighlight(null)}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((e) => {
                const [Icon, tone] = ICON[e.kind]
                const id = e.id
                return (
                  <motion.li
                    key={e.seq}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  >
                    <button
                      type="button"
                      disabled={!id}
                      onPointerEnter={() => onHighlight(id ?? null)}
                      onClick={() => id && onSelect(id)}
                    >
                      <Icon size={14} className={`tone ${tone}`} aria-hidden />
                      <span className="grow">
                        {id && <span className="mono strong">{id.slice(0, 6)} </span>}
                        {e.text}
                      </span>
                      <time className="faint">{ago(now - e.at)}</time>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  )
}
