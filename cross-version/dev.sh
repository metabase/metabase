#!/usr/bin/env bash
#
# Interactive dev environment for writing cross-version e2e tests.
#
# Starts the specified Metabase version and opens Cypress.
# Uses Postgres with a shared volume so snapshot/restore works via test endpoints.
#
# Resolves which spec folder to use:
#   e2e/cross-version/{major}/ if it exists, otherwise e2e/cross-version/latest/
#
# Usage:
#   ./dev.sh --version v1.57.6
#   ./dev.sh --version v1.58.7 --port 3001
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION=""
PORT="${METABASE_PORT:-3077}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[xv-dev]${NC} $*"; }
error() { echo -e "${RED}[xv-dev]${NC} $*" >&2; }

usage() {
  cat <<EOF
Usage: $0 --version VERSION [--port PORT]

Options:
  --version VERSION   Metabase version to run (e.g., v1.57.6, v1.58.7)
  --port PORT         Port to expose (default: 3077)
  --help              Show this help

Examples:
  $0 --version v1.57.6
  $0 --version v1.58.7 --port 3001
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --help) usage ;;
    *) error "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  error "--version is required"
  usage
fi

# CLI wrapper for version helpers
cli() {
  bun "$SCRIPT_DIR/cli.ts" "$@"
}

# Compose wrapper: pinned to this directory's project so it keeps working
# after we cd into the repo root to open Cypress (and from the exit trap)
compose() {
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" "$@"
}

IMAGE=$(cli image "$VERSION")
MAJOR=$(cli major "$VERSION")
LOG_FILE="$SCRIPT_DIR/.xv-metabase.log"

# Resolve spec folder: exact match, then closest older-version folder, then latest
SPECS_DIR="$REPO_ROOT/e2e/cross-version/${MAJOR}"
if [[ ! -d "$SPECS_DIR" ]]; then
  closest=""
  closest_dist=999
  for dir in "$REPO_ROOT"/e2e/cross-version/[0-9]*/; do
    # Skip the literal pattern when the glob matches no numbered folders
    [[ -d "$dir" ]] || continue
    v=$(basename "$dir")
    (( v < MAJOR )) && continue
    dist=$(( v - MAJOR ))
    if (( dist < closest_dist )); then
      closest_dist=$dist
      closest="$dir"
    fi
  done
  if [[ -n "$closest" ]]; then
    SPECS_DIR="${closest%/}"
  else
    SPECS_DIR="$REPO_ROOT/e2e/cross-version/latest"
  fi
fi

log "============================================"
log "Cross-Version Dev Environment"
log "============================================"
log "Version: $VERSION"
log "Image:   $IMAGE"
log "Port:    $PORT"
log "Logs:    $LOG_FILE"
log "Specs:   $SPECS_DIR"
log "============================================"

# Clean up previous session
rm -f "$LOG_FILE"

LOGS_PID=""

cleanup() {
  log "Stopping Metabase..."
  # Removing the containers ends the log streams, so the follower exits on its
  # own once this returns — and its last writes are the shutdown logs
  compose down --volumes 2>/dev/null || true
  if [[ -n "$LOGS_PID" ]]; then
    wait "$LOGS_PID" 2>/dev/null || true
  fi
  log "Logs from this session: $LOG_FILE"
}

trap cleanup EXIT

log "Starting Metabase ${VERSION}..."
METABASE_IMAGE="$IMAGE" \
METABASE_PORT="$PORT" compose up -d

# Follow container logs into a file for debugging (tail -f it in another shell)
compose logs --no-color --follow > "$LOG_FILE" 2>&1 &
LOGS_PID=$!

log "Waiting for Metabase to be ready..."
TIMEOUT=120
START=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START ))
  if (( ELAPSED >= TIMEOUT )); then
    error "Timed out after ${TIMEOUT}s"
    tail -n 100 "$LOG_FILE"
    exit 1
  fi
  if curl -sf "http://localhost:${PORT}/api/health" 2>/dev/null | grep -q '"ok"'; then
    break
  fi
  sleep 2
done
log "Metabase is ready at http://localhost:${PORT}"

log ""
log "Opening Cypress..."
cd "$REPO_ROOT"

CYPRESS_BASE_URL="http://localhost:${PORT}" \
  bunx cypress open \
    --e2e \
    --config-file "e2e/cross-version/cypress.config.js" \
    --config "specPattern=${SPECS_DIR}/**/*.cy.spec.ts"
