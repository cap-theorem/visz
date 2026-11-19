import { LocateFixed, Maximize2, Minus, Plus, Tag } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { IconButton } from './ui'

interface Props {
  following: boolean
  labels: boolean
  onZoom: (factor: number) => void
  onFit: () => void
  onToggleLabels: () => void
}

export function CanvasControls({ following, labels, onZoom, onFit, onToggleLabels }: Props) {
  return (
    <>
      <div className="glass toolbar" role="toolbar" aria-label="View" aria-orientation="vertical">
        <IconButton label="Zoom in" shortcut="+" tip="left" onClick={() => onZoom(1.4)}>
          <Plus size={15} />
        </IconButton>
        <IconButton label="Zoom out" shortcut="−" tip="left" onClick={() => onZoom(1 / 1.4)}>
          <Minus size={15} />
        </IconButton>
        <span className="separator" />
        <IconButton label="Fit the graph" shortcut="F" tip="left" active={following} onClick={onFit}>
          <Maximize2 size={15} />
        </IconButton>
        <IconButton label="Label every node" shortcut="L" tip="left" active={labels} onClick={onToggleLabels}>
          <Tag size={15} />
        </IconButton>
      </div>
      <AnimatePresence>
        {!following && (
          <motion.button
            type="button"
            className="glass recenter"
            onClick={onFit}
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 12, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          >
            <LocateFixed size={14} />
            Re-center
            <kbd>F</kbd>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
