#!/usr/bin/env bash
#
# Interactive dev environment for writing cross-version e2e tests.
#
# Starts an older Metabase version in Docker with H2 and opens Cypress.
# Uses H2 with a shared volume so snapshot/restore works via test endpoints.
#
# Resolves which spec folder to use:
#   e2e/cross-version/{major}/ if it exists, otherwise e2e/cross-version/latest/
#
# Usage:
#   ./dev.sh --version v0.57.6
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
  --version VERSION   Metabase version to run (e.g., v0.57.6, v1.58.7)
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

IMAGE=$(cli image "$VERSION")
MAJOR=$(cli major "$VERSION")
H2_DIR="$SCRIPT_DIR/.xv-h2/v${MAJOR}"

# Resolve spec folder: version-specific override or latest
SPECS_DIR="$REPO_ROOT/e2e/cross-version/${MAJOR}"
if [[ ! -d "$SPECS_DIR" ]]; then
  SPECS_DIR="$REPO_ROOT/e2e/cross-version/latest"
fi

log "============================================"
log "Cross-Version Dev Environment"
log "============================================"
log "Version: $VERSION"
log "Image:   $IMAGE"
log "Port:    $PORT"
log "H2 dir:  $H2_DIR"
log "Specs:   $SPECS_DIR"
log "============================================"

# Start with a clean app db every time
# H2 files are owned by the Docker container's user, so use Docker to clean up
if [[ -d "$H2_DIR" ]]; then
  docker run --rm -v "$(dirname "$H2_DIR"):/data" alpine rm -rf "/data/$(basename "$H2_DIR")"
fi
mkdir -p "$H2_DIR"

cleanup() {
  log "Stopping Metabase..."
  docker rm -f xv-dev-metabase 2>/dev/null || true
}

trap cleanup EXIT

# Remove any leftover container from a previous run (e.g., after SIGKILL)
docker rm -f xv-dev-metabase 2>/dev/null || true

log "Starting Metabase ${VERSION}..."
docker run -d \
  --name xv-dev-metabase \
  -p "${PORT}:3000" \
  -v "${H2_DIR}:/metabase.db" \
  -e MB_ENABLE_TEST_ENDPOINTS=true \
  -e MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE=true \
  "$IMAGE"

log "Waiting for Metabase to be ready..."
TIMEOUT=120
START=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START ))
  if (( ELAPSED >= TIMEOUT )); then
    error "Timed out after ${TIMEOUT}s"
    docker logs xv-dev-metabase
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

CROSS_VERSION_DEV_MODE=true \
CYPRESS_BASE_URL="http://localhost:${PORT}" \
  bunx cypress open \
    --config-file "e2e/cross-version/cypress.config.js" \
    --config "specPattern=${SPECS_DIR}/**/*.cy.spec.ts"
