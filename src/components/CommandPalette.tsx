import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { CollectorNode, Graph, NodeState } from '../collector'
import { StateDot } from './ui'

export interface PaletteAction {
  id: string
  label: string
  icon: ReactNode
  shortcut?: string
  run: () => void
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  graph: Graph | null
  actions: PaletteAction[]
  onPickNode: (id: string) => void
}

const LIMIT = 40
// Problems first: with no query, the list opens on what needs a look.
const RANK: Record<NodeState, number> = { orphaned: 0, isolated: 1, active: 2 }

export function CommandPalette({ open, onOpenChange, graph, actions, onPickNode }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const { nodes, total } = useMemo(() => {
    if (!graph) return { nodes: [] as CollectorNode[], total: 0 }
    const degree = (id: string) => graph.adj.get(id)?.length ?? 0
    const matches = (n: CollectorNode) =>
      n.id.includes(q) || n.address.includes(q) || !!n.service?.toLowerCase().includes(q) || !!n.instance?.toLowerCase().includes(q)
    const hits = [...graph.nodes.values()].filter((n) => !q || matches(n))
    hits.sort((a, b) => RANK[a.state] - RANK[b.state] || degree(b.id) - degree(a.id))
    return { nodes: hits.slice(0, LIMIT), total: hits.length }
  }, [graph, q])
  const shownActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q))

  const setOpen = (next: boolean) => {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search nodes and actions"
      shouldFilter={false}
      loop
      overlayClassName="palette-overlay"
      contentClassName="palette"
    >
      <div className="palette-input">
        <Search size={16} aria-hidden />
        <Command.Input value={query} onValueChange={setQuery} placeholder="Search nodes by service, instance, id or address, or run an action…" />
        <kbd>esc</kbd>
      </div>
      <Command.List>
        <Command.Empty>Nothing matches “{query}”.</Command.Empty>
        {nodes.length > 0 && (
          <Command.Group heading={total > nodes.length ? `Nodes · ${nodes.length} of ${total}` : `Nodes · ${total}`}>
            {nodes.map((n) => (
              <Command.Item
                key={n.id}
                value={`node ${n.id}`}
                onSelect={() => {
                  onPickNode(n.id)
                  setOpen(false)
                }}
              >
                <StateDot state={n.state} component={n.component} />
                <span className="mono">{n.instance ?? n.id.slice(0, 8)}</span>
                <span className="faint grow">{n.service ?? n.address}</span>
                <span className="meta">{graph?.adj.get(n.id)?.length ?? 0} links</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {shownActions.length > 0 && (
          <Command.Group heading="Actions">
            {shownActions.map((a) => (
              <Command.Item
                key={a.id}
                value={`action ${a.id}`}
                onSelect={() => {
                  setOpen(false)
                  a.run()
                }}
              >
                <span className="action-icon">{a.icon}</span>
                <span className="grow">{a.label}</span>
                {a.shortcut && <kbd>{a.shortcut}</kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <footer className="palette-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
        <span>
          <kbd>esc</kbd> to close
        </span>
      </footer>
    </Command.Dialog>
  )
}
