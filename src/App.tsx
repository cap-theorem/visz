import { Copy, Keyboard, Maximize2, Minus, Plus, PlugZap, Tag } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ActivityFeed } from './components/ActivityFeed'
import { CanvasControls } from './components/CanvasControls'
import { CommandPalette, type PaletteAction } from './components/CommandPalette'
import { EmptyState } from './components/EmptyState'
import { type Camera, GraphCanvas } from './components/GraphCanvas'
import { Inspector } from './components/Inspector'
import { MetricsCard } from './components/MetricsCard'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { TopBar } from './components/TopBar'
import { isTyping } from './lib'
import { LiveGraph } from './live'

const DEFAULT_COLLECTOR: string = import.meta.env.VITE_COLLECTOR_URL ?? 'http://localhost:8100'
const STORAGE_KEY = 'visz.collector'
const ZOOM_STEP = 1.4

function initialCollector() {
  const fromQuery = new URLSearchParams(window.location.search).get('collector')
  if (fromQuery) return fromQuery
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_COLLECTOR
  } catch {
    return DEFAULT_COLLECTOR
  }
}

export default function App() {
  const [collector, setCollector] = useState(initialCollector)

  const changeCollector = (url: string) => {
    setCollector(url)
    try {
      localStorage.setItem(STORAGE_KEY, url)
    } catch {
      // storage blocked: the query string still carries it
    }
    const query = new URLSearchParams(window.location.search)
    query.set('collector', url)
    window.history.replaceState(null, '', `?${query}`)
  }

  // A new collector remounts the view: new connection, new layout.
  return <Overlay key={collector} collector={collector} onCollectorChange={changeCollector} />
}

interface OverlayProps {
  collector: string
  onCollectorChange: (url: string) => void
}

function Overlay({ collector, onCollectorChange }: OverlayProps) {
  const [live] = useState(() => new LiveGraph(collector))
  useEffect(() => {
    live.start()
    return () => live.stop()
  }, [live])
  const { status, graph, summary, log, gaps, updatedAt } = useSyncExternalStore(live.subscribe, live.getState)
  const scene = live.scene

  const [selected, setSelected] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)
  const [labels, setLabels] = useState(false)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [connection, setConnection] = useState(false)

  const camera = useMemo<Camera>(
    () => ({
      fit: () => {
        scene.fit()
        setFollowing(true)
      },
      zoom: (factor, px, py) => {
        scene.zoomAt(factor, px, py)
        setFollowing(false)
      },
      pan: (dx, dy) => {
        scene.panBy(dx, dy)
        setFollowing(false)
      },
      focus: (id) => {
        scene.focusOn(id)
        setFollowing(false)
      },
    }),
    [scene],
  )

  useEffect(() => {
    scene.showAllLabels(labels)
  }, [scene, labels])

  const node = selected ? graph?.nodes.get(selected) : undefined
  const pickNode = (id: string) => {
    setSelected(id)
    camera.focus(id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((open) => !open)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      switch (e.key) {
        case '/':
          e.preventDefault()
          setPalette(true)
          break
        case 'Escape':
          if (help) setHelp(false)
          else if (connection) setConnection(false)
          else setSelected(null)
          break
        case 'f':
        case 'F':
          camera.fit()
          break
        case '+':
        case '=':
          camera.zoom(ZOOM_STEP)
          break
        case '-':
        case '_':
          camera.zoom(1 / ZOOM_STEP)
          break
        case 'l':
        case 'L':
          setLabels((on) => !on)
          break
        case '?':
          setHelp((open) => !open)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [camera, help, connection])

  const actions: PaletteAction[] = [
    { id: 'fit', label: 'Fit the graph', icon: <Maximize2 size={15} />, shortcut: 'F', run: camera.fit },
    { id: 'zoom-in', label: 'Zoom in', icon: <Plus size={15} />, shortcut: '+', run: () => camera.zoom(ZOOM_STEP) },
    { id: 'zoom-out', label: 'Zoom out', icon: <Minus size={15} />, shortcut: '−', run: () => camera.zoom(1 / ZOOM_STEP) },
    {
      id: 'labels',
      label: labels ? 'Label only small graphs' : 'Label every node',
      icon: <Tag size={15} />,
      shortcut: 'L',
      run: () => setLabels((on) => !on),
    },
    { id: 'collector', label: 'Change collector…', icon: <PlugZap size={15} />, run: () => setConnection(true) },
    { id: 'copy', label: 'Copy collector URL', icon: <Copy size={15} />, run: () => navigator.clipboard.writeText(collector) },
    { id: 'help', label: 'Keyboard shortcuts', icon: <Keyboard size={15} />, shortcut: '?', run: () => setHelp(true) },
  ]

  return (
    <main className="app">
      <GraphCanvas
        scene={scene}
        graph={graph}
        camera={camera}
        selected={node ? node.id : null}
        highlight={highlight}
        onSelect={setSelected}
      />
      <TopBar
        collector={collector}
        status={status}
        version={graph?.version}
        updatedAt={updatedAt}
        connectionOpen={connection}
        onConnectionOpen={setConnection}
        onCollectorChange={onCollectorChange}
        onSearch={() => setPalette(true)}
        onHelp={() => setHelp(true)}
      />
      <MetricsCard graph={graph} summary={summary} gaps={gaps} />
      <AnimatePresence>
        {graph && node && (
          <Inspector
            key="inspector"
            graph={graph}
            node={node}
            onSelect={pickNode}
            onHighlight={setHighlight}
            onFocus={() => camera.focus(node.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
      <ActivityFeed entries={log} onSelect={pickNode} onHighlight={setHighlight} />
      <CanvasControls
        following={following}
        labels={labels}
        onZoom={(factor) => camera.zoom(factor)}
        onFit={camera.fit}
        onToggleLabels={() => setLabels((on) => !on)}
      />
      <EmptyState status={status} graph={graph} collector={collector} onChangeCollector={() => setConnection(true)} />
      <CommandPalette open={palette} onOpenChange={setPalette} graph={graph} actions={actions} onPickNode={pickNode} />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
