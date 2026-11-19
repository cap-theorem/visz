#!/usr/bin/env bash
# A local collector plus spctrld nodes on loopback, for working on visz.
#
#   scripts/dev-cluster.sh up [N]     build, start the collector on :8100 and N nodes, one per second (default 12)
#   scripts/dev-cluster.sh add [N]    start N more nodes, one per second (default 1)
#   scripts/dev-cluster.sh kill [N]   SIGKILL N random nodes (default 1); the collector orphans them
#   scripts/dev-cluster.sh stop [N]   SIGTERM N random nodes (default 1); they report that they left
#   scripts/dev-cluster.sh ps         list running nodes
#   scripts/dev-cluster.sh down       stop every node and the collector
#
# SPECTRAL is a checkout of cap-theorem/spectral (default ~/Repos/spectral);
# JOIN_EVERY is the seconds between starting nodes (default 1).
set -euo pipefail

SPECTRAL=${SPECTRAL:-$HOME/Repos/spectral}
COLLECTOR_PORT=${COLLECTOR_PORT:-8100}
JOIN_EVERY=${JOIN_EVERY:-1}
UDP_BASE=${UDP_BASE:-17000}
API_BASE=${API_BASE:-18000}
run=$(cd "$(dirname "$0")/.." && pwd)/.cluster
mkdir -p "$run/pids" "$run/logs"

build() {
  (cd "$SPECTRAL" && go build -o "$run/spctrld" ./cmd/spctrld && go build -o "$run/collector" ./cmd/collector)
}

collector_up() { curl -fsS -o /dev/null "http://127.0.0.1:$COLLECTOR_PORT/healthz" 2>/dev/null; }

start_collector() {
  collector_up && return
  nohup "$run/collector" --listen-addr "127.0.0.1:$COLLECTOR_PORT" >"$run/logs/collector.log" 2>&1 &
  echo $! >"$run/collector.pid"
  for _ in $(seq 50); do
    collector_up && { echo "collector on http://127.0.0.1:$COLLECTOR_PORT"; return; }
    sleep 0.1
  done
  echo "collector did not start, see $run/logs/collector.log" >&2
  exit 1
}

# Running nodes as "<index> <pid>" lines; forgets nodes that have exited.
nodes() {
  for f in "$run"/pids/*.pid; do
    [ -e "$f" ] || continue
    local pid i
    pid=$(cat "$f")
    i=$(basename "$f" .pid)
    if kill -0 "$pid" 2>/dev/null; then echo "$i $pid"; else rm -f "$f"; fi
  done
}

shuffle() { awk -v seed="$RANDOM" 'BEGIN { srand(seed) } { print rand() "\t" $0 }' | sort -n | cut -f2-; }

# Starts a new node that joins through up to three running ones.
start_node() {
  local i
  i=$(cat "$run/next" 2>/dev/null || echo 0)
  echo $((i + 1)) >"$run/next"
  local args=(
    --listen-addr "127.0.0.1:$((UDP_BASE + i))"
    --api-port "$((API_BASE + i))"
    --collector-url "http://127.0.0.1:$COLLECTOR_PORT"
  )
  local seeds
  seeds=$(nodes | shuffle | head -3)
  while read -r j _; do
    if [ -n "$j" ]; then args+=(--bootstrap "127.0.0.1:$((UDP_BASE + j))"); fi
  done <<<"$seeds"
  GOMAXPROCS=1 nohup "$run/spctrld" "${args[@]}" >"$run/logs/node-$i.log" 2>&1 &
  echo $! >"$run/pids/$i.pid"
  echo "node $i on 127.0.0.1:$((UDP_BASE + i))"
}

# macOS drops UDP datagrams over net.inet.udp.maxdgram (9216 by default). Past
# ~130 members a seed's reply to a joiner is bigger than that, so joiners stay isolated.
warn_udp_limit() {
  [ "$(uname)" = Darwin ] || return 0
  local max
  max=$(sysctl -n net.inet.udp.maxdgram 2>/dev/null || echo 65535)
  if [ "$max" -lt 65535 ] && [ "$(nodes | wc -l)" -gt 120 ]; then
    echo "warning: macOS drops UDP datagrams over $max bytes, so past ~130 nodes new joiners stay isolated." >&2
    echo "         Raise it with: sudo sysctl -w net.inet.udp.maxdgram=65535" >&2
  fi
}

signal_nodes() {
  local targets
  targets=$(nodes | shuffle | head -"$2")
  [ -n "$targets" ] || { echo "no running nodes" >&2; exit 1; }
  while read -r i pid; do
    kill -"$1" "$pid" && echo "SIG$1 node $i"
  done <<<"$targets"
}

case "${1:-}" in
up)
  build
  start_collector
  for ((n = 0; n < ${2:-12}; n++)); do
    start_node
    sleep "$JOIN_EVERY"
  done
  warn_udp_limit
  ;;
add)
  for ((n = 0; n < ${2:-1}; n++)); do
    start_node
    if ((n + 1 < ${2:-1})); then sleep "$JOIN_EVERY"; fi
  done
  warn_udp_limit
  ;;
kill) signal_nodes KILL "${2:-1}" ;;
stop) signal_nodes TERM "${2:-1}" ;;
ps) nodes | sort -n | while read -r i pid; do echo "node $i pid $pid 127.0.0.1:$((UDP_BASE + i))"; done ;;
down)
  nodes | while read -r _ pid; do kill -KILL "$pid"; done
  rm -f "$run"/pids/*.pid "$run/next"
  if [ -f "$run/collector.pid" ]; then
    kill "$(cat "$run/collector.pid")" 2>/dev/null || true
    rm -f "$run/collector.pid"
  fi
  echo down
  ;;
*)
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
