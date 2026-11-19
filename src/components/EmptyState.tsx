import { motion } from 'motion/react'
import type { Graph } from '../collector'
import type { Status } from '../live'

interface Props {
  status: Status
  graph: Graph | null
  collector: string
  onChangeCollector: () => void
}

export function EmptyState({ status, graph, collector, onChangeCollector }: Props) {
  if (graph && graph.nodes.size > 0) return null

  const unreachable = !graph && status === 'unreachable'
  const title = graph ? 'No nodes yet' : unreachable ? 'Can’t reach the collector' : 'Connecting'
  const body = graph
    ? 'Start spctrld with --collector-url pointing at this collector and nodes appear here as they join.'
    : unreachable
      ? `Nothing answered at ${collector}. Run it from cap-theorem/spectral with go run ./cmd/collector.`
      : collector

  return (
    <div className="empty">
      <motion.div
        key={title}
        className="empty-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="status"
      >
        <span className={`beacon ${unreachable ? 'down' : graph ? 'idle' : 'busy'}`} aria-hidden />
        <h2>{title}</h2>
        <p>{body}</p>
        {unreachable && (
          <button type="button" className="button" onClick={onChangeCollector}>
            Change collector
          </button>
        )}
      </motion.div>
    </div>
  )
}
