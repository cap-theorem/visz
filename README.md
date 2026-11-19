# visz

A live view of a spectral overlay. visz follows the topology collector
(`cmd/collector` in [cap-theorem/spectral](https://github.com/cap-theorem/spectral))
and draws the overlay as it changes:

- **Joins:** nodes pop in blue and their new links flash.
- **Crashes:** nodes the collector presumes dead (orphaned) turn red and fade
  until the collector drops them.
- **Leaves:** nodes that leave fade away.

A side panel tracks nodes, links, degree, components and the spectral gap λ₂,
with its recent history.

## Run it

Needs Node 22 or later.

```bash
npm install
npm run dev
```

This serves the app at http://localhost:5173 and reads the collector at
http://localhost:8100. To use another collector, either:

- add `?collector=http://host:8100` to the URL,
- type it in the box at the top right (the browser remembers it), or
- set `VITE_COLLECTOR_URL` at build time.

Controls:

| input | does |
|---|---|
| click a node | opens it in the inspector, with its neighbours |
| ⌘K or `/` | searches nodes by id or address, and runs actions |
| scroll | pans; pinch or ⌘-scroll zooms |
| drag | pans, or moves a node |
| double-click | zooms to a node, or fits the graph |
| `F` | fits the graph again |
| `+` / `−` | zooms in and out |
| `L` | labels every node |
| `?` | lists the shortcuts |

Once you pan or zoom, the camera stops following the graph; Re-center or `F`
brings it back.

### A local cluster to watch

`scripts/dev-cluster.sh` builds spctrld and the collector from a spectral
checkout, then runs them on loopback:

```bash
scripts/dev-cluster.sh up 12    # the collector on :8100 and 12 nodes, one per second
scripts/dev-cluster.sh add 5    # five more joins
scripts/dev-cluster.sh kill 2   # SIGKILL: orphaned within seconds, dropped after the collector's --stale-after (90 s)
scripts/dev-cluster.sh stop 1   # SIGTERM: the node reports that it left and fades out
scripts/dev-cluster.sh down
```

To build from a different checkout, set `SPECTRAL=path/to/spectral` (the
default is `~/Repos/spectral`). To join nodes faster, set `JOIN_EVERY=0.2`.
Logs go to `.cluster/logs/`.

On macOS, keep a local cluster under about 130 nodes. macOS drops UDP
datagrams over 9,216 bytes (`net.inet.udp.maxdgram`), and past that size a
seed's reply to a joiner gets dropped, so new nodes stay isolated or form
islands. To go bigger, run `sudo sysctl -w net.inet.udp.maxdgram=65535`.
Linux doesn't have this limit.

## Build

`npm run build` writes a static site to `dist/`, which you can serve from
anywhere. The collector's read endpoints allow any origin, so the page doesn't
need to share a host with the collector. One catch: a page served over HTTPS
needs the collector on HTTPS too, because browsers block plain-HTTP streams
from secure pages.

## How it works

| file | does |
|---|---|
| `src/collector.ts` | the collector's API types; builds the graph from a snapshot and applies deltas |
| `src/live.ts` | follows `GET /v1/graph/stream` (one snapshot, then one delta per change), resyncs when a delta is missed, reconnects with backoff, and polls `/v1/summary` |
| `src/scene.ts` | the d3-force layout, the canvas drawing and its animations, and the camera (follows the graph until you pan or zoom) |
| `src/components/` | the canvas and the panels: top bar, metrics, inspector, activity, view controls, ⌘K menu; React reads `live.ts` with `useSyncExternalStore` |

The UI uses [motion](https://motion.dev) for animation, [cmdk](https://cmdk.paco.me)
for the command menu, [lucide](https://lucide.dev) icons and the Geist typefaces.

**Node colours:**

| colour | meaning |
|---|---|
| white | in the largest component |
| blue | just joined |
| indigo, purple, pink… | in a smaller component, so the overlay has split |
| orange, dashed ring | isolated: no links |
| red | orphaned |

**Links:** a link is drawn only if both of its ends report it, which is the collector's rule.
