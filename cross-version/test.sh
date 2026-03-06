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
  local version="$2"
  log "Running 'migrate down' with image: $image"

  # HACK: The HEAD Docker image has version "vUNKNOWN" in its version.properties,
  # which causes `migrate down` to fail with a NullPointerException when trying
  # to determine the current major version. To work around this, we extract the
  # JAR, replace version.properties with a fake version (v1.XX.1000), and mount
  # the modified JAR. This ensures HEAD is treated as "newer" than any released
  # version, so migrate down will properly roll back all migrations.
  #
  # This is a temporary workaround. See: [TODO: add Linear issue link]
  # To remove this hack, Metabase would need to handle vUNKNOWN in rollback-major-version!
  if [[ "$version" == "HEAD" ]]; then
    if [[ -z "$CURRENT_VERSION" ]]; then
      error "CURRENT_VERSION must be set when testing HEAD downgrades"
      return 1
    fi
    local fake_version="v1.${CURRENT_VERSION}.1000"
    local work_dir="/tmp/metabase-head-hack"
    local modified_jar="$work_dir/metabase.jar"

    log "HACK: Patching HEAD JAR with fake version: $fake_version"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"

    # Extract JAR from container (copy to host with proper permissions)
    docker create --name metabase-jar-extract "$image" >/dev/null
    docker cp metabase-jar-extract:/app/metabase.jar "$modified_jar"
    docker rm metabase-jar-extract >/dev/null

    # Create fake version.properties and update the JAR
    echo "tag=$fake_version" > "$work_dir/version.properties"
    echo "hash=HEAD" >> "$work_dir/version.properties"
    echo "date=$(date +%Y-%m-%d)" >> "$work_dir/version.properties"
    (cd "$work_dir" && zip -u metabase.jar version.properties >/dev/null)

    log "HACK: JAR patched successfully"

    METABASE_IMAGE="$image" docker compose run --rm \
      -v "$modified_jar:/app/metabase.jar:ro" \
      metabase "migrate down"
  else
    METABASE_IMAGE="$image" docker compose run --rm metabase "migrate down"
  fi
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

check_image_exists() {
  local image="$1"
  if ! docker manifest inspect "$image" > /dev/null 2>&1; then
    error "Docker image not found: $image"
    exit 1
  fi
}

main() {
  local direction source_image target_image

  direction=$(cli compare "$SOURCE_VERSION" "$TARGET_VERSION") || exit 1
  source_image=$(cli image "$SOURCE_VERSION") || exit 1
  target_image=$(cli image "$TARGET_VERSION") || exit 1

  if [[ "$direction" == "same" ]]; then
    error "Source and target versions are the same"
    exit 1
  fi

  log "Checking if Docker images exist..."
  check_image_exists "$source_image"
  check_image_exists "$target_image"

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
    error "❌ SOURCE version failed health check"
    docker compose logs metabase
    exit 1
  fi

  log "✅ SOURCE version is healthy"

  log ""
  log "Step 2: Stopping SOURCE version..."
  stop_metabase

  log ""
  log "Step 3: Starting TARGET version ($TARGET_VERSION)..."
  start_metabase "$target_image"

  if [[ "$direction" == "upgrade" ]]; then
    # Upgrade: should migrate automatically and become healthy
    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "❌ TARGET version failed health check after upgrade"
      docker compose logs metabase
      exit 1
    fi
    log "✅ UPGRADE successful - TARGET version is healthy"

  else
    # Downgrade: should refuse to start, then we run migrate down
    if ! check_downgrade_refused; then
      error "❌ TARGET version did not properly detect downgrade"
      docker compose logs metabase
      exit 1
    fi

    # Stop the failed container
    stop_metabase

    # Run migrate down (must use SOURCE image - the newer version)
    log ""
    log "Step 4: Running migrate down with SOURCE version..."
    if ! run_migrate_down "$source_image" "$SOURCE_VERSION"; then
      error "❌ migrate down failed"
      exit 1
    fi

    # Try starting again
    log ""
    log "Step 5: Starting TARGET version after migrate down..."
    start_metabase "$target_image"

    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "❌ TARGET version failed health check after migrate down"
      docker compose logs metabase
      exit 1
    fi
    log "✅ DOWNGRADE successful - TARGET version is healthy after migrate down"
  fi

  log ""
  log "============================================"
  log "✅ TEST PASSED"
  log "============================================"
}

main
