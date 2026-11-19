import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { MOD } from '../lib'
import { IconButton } from './ui'

const GROUPS: [string, [string[], string][]][] = [
  [
    'General',
    [
      [[`${MOD}K`], 'Search nodes and actions'],
      [['/'], 'Search'],
      [['Esc'], 'Close, or deselect the node'],
      [['?'], 'This list'],
    ],
  ],
  [
    'View',
    [
      [['F'], 'Fit the whole graph'],
      [['+', '−'], 'Zoom in and out'],
      [['L'], 'Label every node'],
      [['M'], 'Show or hide messages'],
    ],
  ],
  [
    'Pointer',
    [
      [['Scroll'], 'Pan'],
      [['Pinch', `${MOD}Scroll`], 'Zoom'],
      [['Drag'], 'Pan, or move a node'],
      [['Click'], 'Select a node'],
      [['Double-click'], 'Zoom to a node, or fit the graph'],
    ],
  ],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="glass modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <header>
              <h2 id="shortcuts-title">Keyboard shortcuts</h2>
              <IconButton label="Close" shortcut="Esc" tip="below" onClick={onClose}>
                <X size={15} />
              </IconButton>
            </header>
            {GROUPS.map(([title, rows]) => (
              <section key={title}>
                <h3>{title}</h3>
                <ul>
                  {rows.map(([keys, what]) => (
                    <li key={what}>
                      <span>{what}</span>
                      <span className="keys">
                        {keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
