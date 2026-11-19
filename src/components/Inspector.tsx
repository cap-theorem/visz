import { Crosshair, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { CollectorNode, Graph } from '../collector'
import { CopyButton, IconButton, StateBadge, StateDot } from './ui'

interface Props {
  graph: Graph
  node: CollectorNode
  onSelect: (id: string) => void
  onHighlight: (id: string | null) => void
  onFocus: () => void
  onClose: () => void
}

export function Inspector({ graph, node, onSelect, onHighlight, onFocus, onClose }: Props) {
  const degree = (id: string) => graph.adj.get(id)?.length ?? 0
  const neighbours = (graph.adj.get(node.id) ?? [])
    .map((id) => graph.nodes.get(id))
    .filter((n): n is CollectorNode => n !== undefined)
    .sort((a, b) => degree(b.id) - degree(a.id))
  let componentSize = 0
  for (const n of graph.nodes.values()) if (n.state !== 'orphaned' && n.component === node.component) componentSize++

  const component =
    node.component < 0 ? 'None' : node.component === 0 ? `Largest · ${componentSize} nodes` : `#${node.component} · ${componentSize} nodes`

  return (
    <motion.aside
      className="glass inspector"
      aria-label="Selected node"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
    >
      <header>
        <StateBadge state={node.state} component={node.component} />
        <div className="spacer" />
        <IconButton label="Center on node" tip="below" onClick={onFocus}>
          <Crosshair size={15} />
        </IconButton>
        <IconButton label="Close" shortcut="Esc" tip="below" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </header>

      <motion.div key={node.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
        <div className="node-id">
          <span className="mono">{node.id}</span>
          <CopyButton value={node.id} label="ID" />
        </div>
        <dl className="props">
          <div>
            <dt>Service</dt>
            <dd>{node.service ?? <span className="faint">None registered</span>}</dd>
          </div>
          {node.instance && (
            <div>
              <dt>Instance</dt>
              <dd>
                <span className="mono">{node.instance}</span>
                <CopyButton value={node.instance} label="instance" />
              </dd>
            </div>
          )}
          <div>
            <dt>Address</dt>
            <dd>
              <span className="mono">{node.address}</span>
              <CopyButton value={node.address} label="address" />
            </dd>
          </div>
          <div>
            <dt>Component</dt>
            <dd>{component}</dd>
          </div>
          <div>
            <dt>Links</dt>
            <dd className="mono">{neighbours.length}</dd>
          </div>
        </dl>

        <div className="section-title">
          <span>Neighbours</span>
          <span className="count">{neighbours.length}</span>
        </div>
        <ul className="rows" onPointerLeave={() => onHighlight(null)}>
          {neighbours.map((n) => (
            <li key={n.id}>
              <button type="button" onPointerEnter={() => onHighlight(n.id)} onClick={() => onSelect(n.id)}>
                <StateDot state={n.state} component={n.component} />
                <span className="mono">{n.instance ?? n.id.slice(0, 8)}</span>
                <span className="faint grow">{n.service ?? n.address}</span>
                <span className="mono faint">{degree(n.id)}</span>
              </button>
            </li>
          ))}
          {neighbours.length === 0 && <li className="none">No links right now.</li>}
        </ul>
      </motion.div>
    </motion.aside>
  )
}
