#!/usr/bin/env bash
#
# Cross-version migration testing for Metabase
#
# Usage:
#   ./test.sh --source v0.58.6 --target v0.58.7
#
# Edition (OSS/EE) is inferred from version prefix (v0.x = OSS, v1.x = EE).
# Direction (upgrade/downgrade) is inferred from version comparison.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Defaults
SOURCE_VERSION=""
TARGET_VERSION=""
METABASE_PORT="${METABASE_PORT:-3000}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[cross-version]${NC} $*"; }
warn() { echo -e "${YELLOW}[cross-version]${NC} $*"; }
error() { echo -e "${RED}[cross-version]${NC} $*" >&2; }

usage() {
  cat <<EOF
Usage: $0 --source VERSION --target VERSION

Options:
  --source VERSION    Source version (e.g., v0.58.6 for OSS, v1.58.6 for EE)
  --target VERSION    Target version (e.g., v0.58.7 for OSS, v1.58.7 for EE)
  --help              Show this help

Examples:
  $0 --source v0.58.6 --target v0.58.7    # Upgrade test (OSS)
  $0 --source v0.58.7 --target v0.58.6    # Downgrade test (OSS)
  $0 --source v1.58.6 --target v1.58.7    # Upgrade test (EE)
EOF
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --source) SOURCE_VERSION="$2"; shift 2 ;;
    --target) TARGET_VERSION="$2"; shift 2 ;;
    --help) usage ;;
    *) error "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$SOURCE_VERSION" || -z "$TARGET_VERSION" ]]; then
  error "Both --source and --target are required"
  usage
fi

# CLI wrapper for version helpers (uses tested TypeScript implementation)
cli() {
  bun "$SCRIPT_DIR/cli.ts" "$@"
}

wait_for_health() {
  local timeout="$1"
  local start_time=$(date +%s)

  log "Waiting for Metabase to be healthy (timeout: ${timeout}s)..."

  while true; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))

    if (( elapsed >= timeout )); then
      error "Health check timed out after ${timeout}s"
      return 1
    fi

    if curl -sf "http://localhost:${METABASE_PORT}/api/health" > /dev/null 2>&1; then
      local response=$(curl -sf "http://localhost:${METABASE_PORT}/api/health")
      if [[ "$response" == '{"status":"ok"}' ]]; then
        log "Health check passed after ${elapsed}s"
        return 0
      fi
    fi

    sleep 2
  done
}

# Start Metabase with a specific image
start_metabase() {
  local image="$1"
  log "Starting Metabase with image: $image"

  METABASE_IMAGE="$image" METABASE_PORT="$METABASE_PORT" \
    docker compose up -d
}

# Stop Metabase (but keep postgres)
stop_metabase() {
  log "Stopping Metabase container..."
  docker compose stop metabase
  docker compose rm -f metabase
}

# https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase#using-the-migrate-down-command
run_migrate_down() {
  local image="$1"
  log "Running 'migrate down' with image: $image"

  METABASE_IMAGE="$image" docker compose run --rm metabase "migrate down"
}

# Check if Metabase refuses to start (downgrade detection)
check_downgrade_refused() {
  local timeout=60
  local start_time=$(date +%s)

  log "Checking if Metabase detects downgrade and refuses to start..."

  while true; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))

    if (( elapsed >= timeout )); then
      error "Timed out waiting for downgrade detection"
      return 1
    fi

    # Check container logs for downgrade error
    local logs=$(docker compose logs metabase 2>&1 || true)

    if echo "$logs" | grep -qi "migrate.*down\|downgrade\|database.*newer"; then
      log "Metabase correctly detected downgrade scenario"
      return 0
    fi

    local status=$(docker compose ps metabase --format '{{.Status}}' 2>/dev/null || echo "")
    if [[ "$status" =~ [Ee]xit ]]; then
      log "Metabase container exited (expected for downgrade)"
      return 0
    fi

    sleep 2
  done
}

cleanup() {
  log "Cleaning up..."
  docker compose down -v --remove-orphans 2>/dev/null || true
}

main() {
  local direction=$(cli compare "$SOURCE_VERSION" "$TARGET_VERSION")

  if [[ "$direction" == "same" ]]; then
    error "Source and target versions are the same"
    exit 1
  fi

  local source_image=$(cli image "$SOURCE_VERSION")
  local target_image=$(cli image "$TARGET_VERSION")

  log "============================================"
  log "Cross-Version Migration Test"
  log "============================================"
  log "Direction: $direction"
  log "Source: $source_image"
  log "Target: $target_image"
  log "============================================"

  # Ensure clean state
  cleanup

  trap cleanup EXIT

  log ""
  log "Step 1: Starting SOURCE version ($SOURCE_VERSION)..."
  start_metabase "$source_image"

  if ! wait_for_health "$HEALTH_TIMEOUT"; then
    error "SOURCE version failed health check"
    docker compose logs metabase
    exit 1
  fi

  log "SOURCE version is healthy"

  log ""
  log "Step 2: Stopping SOURCE version..."
  stop_metabase

  log ""
  log "Step 3: Starting TARGET version ($TARGET_VERSION)..."
  start_metabase "$target_image"

  if [[ "$direction" == "upgrade" ]]; then
    # Upgrade: should migrate automatically and become healthy
    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "TARGET version failed health check after upgrade"
      docker compose logs metabase
      exit 1
    fi
    log "UPGRADE successful - TARGET version is healthy"

  else
    # Downgrade: should refuse to start, then we run migrate down
    if ! check_downgrade_refused; then
      error "TARGET version did not properly detect downgrade"
      docker compose logs metabase
      exit 1
    fi

    # Stop the failed container
    stop_metabase

    # Run migrate down
    log ""
    log "Step 4: Running migrate down..."
    if ! run_migrate_down "$target_image"; then
      error "migrate down failed"
      exit 1
    fi

    # Try starting again
    log ""
    log "Step 5: Starting TARGET version after migrate down..."
    start_metabase "$target_image"

    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "TARGET version failed health check after migrate down"
      docker compose logs metabase
      exit 1
    fi
    log "DOWNGRADE successful - TARGET version is healthy after migrate down"
  fi

  log ""
  log "============================================"
  log "TEST PASSED"
  log "============================================"
}

main
