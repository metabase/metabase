#!/usr/bin/env bash
# Runs multiple MQ benchmark nodes against the same database.
#
# Usage:
#   ./dev/src/dev/mq_perf_multi.sh start       # Start 2 nodes (default)
#   ./dev/src/dev/mq_perf_multi.sh start 4     # Start 4 nodes
#   ./dev/src/dev/mq_perf_multi.sh go          # Send go signal to all waiting nodes
#   ./dev/src/dev/mq_perf_multi.sh stop        # Stop all running nodes
#   ./dev/src/dev/mq_perf_multi.sh logs        # Tail all node logs
#
# Each node starts a lightweight JVM with just DB + MQ (no server),
# waits for a coordinated go signal, then runs all benchmarks.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

LOG_DIR="target/mq-perf-logs"
PID_DIR="target/mq-perf-pids"

cmd_start() {
  local num_nodes="${1:-2}"
  mkdir -p "$LOG_DIR" "$PID_DIR"

  # Clean up stale pids
  rm -f "$PID_DIR"/*.pid

  echo "Starting $num_nodes MQ benchmark nodes..."
  echo "Logs in $LOG_DIR/"
  echo

  for i in $(seq 1 "$num_nodes"); do
    local log_file="$LOG_DIR/node-$i.log"
    clojure -M:dev:ee:ee-dev -e "
      (require 'dev.mq-perf)
      (dev.mq-perf/start-mq!)
      (dev.mq-perf/run-all-benchmarks-coordinated!)
    " > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_DIR/node-$i.pid"
    echo "  Node $i started (PID $pid, log: $log_file)"
  done

  echo
  echo "Nodes are initializing. Once ready, run:"
  echo "  $0 go"
}

cmd_go() {
  echo "Sending go signal..."
  clojure -M:dev:ee:ee-dev -e "
    (require 'dev.mq-perf)
    (dev.mq-perf/start-mq!)
    (dev.mq-perf/signal-go!)
  "
  echo
  echo "Benchmarks started. Watch progress with:"
  echo "  $0 logs"
}

cmd_stop() {
  if [ ! -d "$PID_DIR" ]; then
    echo "No nodes running."
    return
  fi

  for pid_file in "$PID_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file")
    local name
    name=$(basename "$pid_file" .pid)
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "Stopped $name (PID $pid)"
    else
      echo "$name (PID $pid) already exited"
    fi
    rm -f "$pid_file"
  done
}

cmd_logs() {
  if [ ! -d "$LOG_DIR" ]; then
    echo "No logs found."
    return
  fi
  tail -f "$LOG_DIR"/node-*.log
}

case "${1:-}" in
  start) cmd_start "${2:-2}" ;;
  go)    cmd_go ;;
  stop)  cmd_stop ;;
  logs)  cmd_logs ;;
  *)
    echo "Usage: $0 {start [N]|go|stop|logs}"
    echo
    echo "  start [N]  Start N benchmark nodes (default 2)"
    echo "  go         Send go signal to start benchmarks"
    echo "  stop       Kill all running nodes"
    echo "  logs       Tail all node logs"
    exit 1
    ;;
esac
