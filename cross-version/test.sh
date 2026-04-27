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
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

# Defaults
SOURCE_VERSION=""
TARGET_VERSION=""
METABASE_PORT="${METABASE_PORT:-3000}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
RESULT_FILE="${RESULT_FILE:-/tmp/cross-version-result.json}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[cross-version]${NC} $*"; }
warn() { echo -e "${YELLOW}[cross-version]${NC} $*"; }
error() { echo -e "${RED}[cross-version]${NC} $*" >&2; }

# Write a structured result file on failure so CI can categorize the failure
write_failure() {
  local phase="$1"  # "migration" or "e2e"
  jq -n \
    --arg phase "$phase" \
    --arg source "$SOURCE_VERSION" \
    --arg target "$TARGET_VERSION" \
    '{phase:$phase, source:$source, target:$target}' > "$RESULT_FILE"
  log "Wrote failure result to $RESULT_FILE"
}

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

run_e2e() {
  local phase="$1"
  local version="$2"
  local major specs_dir

  major=$(cli major "$version")
  specs_dir="$REPO_ROOT/e2e/cross-version/${major}"
  if [[ ! -d "$specs_dir" ]]; then
    local closest="" closest_dist=999
    for dir in "$REPO_ROOT"/e2e/cross-version/[0-9]*/; do
      local v=$(basename "$dir")
      (( v < major )) && continue
      local dist=$(( v - major ))
      if (( dist < closest_dist )); then
        closest_dist=$dist
        closest="$dir"
      fi
    done
    if [[ -n "$closest" ]]; then
      specs_dir="${closest%/}"
      log "No exact specs for v${major} — using closest: ${specs_dir##*/}/"
    else
      specs_dir="$REPO_ROOT/e2e/cross-version/latest"
      log "No exact specs for v${major} — falling back to latest/"
    fi
  else
    log "Found exact specs for v${major}"
  fi

  log "Running @${phase} e2e tests for ${version} from: e2e/cross-version/${specs_dir##*/}/"
  CYPRESS_SPEC_PATTERN="${specs_dir}/**/*.cy.spec.ts" \
    "$REPO_ROOT/e2e/cross-version/run.sh" --phase "$phase"
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
    docker compose up -d --quiet-pull
}

# Stop Metabase (but keep postgres)
stop_metabase() {
  log "Stopping Metabase container..."
  docker compose stop metabase
  docker compose rm -f metabase
}

# Get edition prefix from version (0 for OSS, 1 for EE)
get_edition_prefix() {
  local version="$1"
  if [[ "$version" == "HEAD" ]]; then
    echo "1"  # HEAD is EE
  elif [[ "$version" =~ ^v([01])\. ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    error "Cannot determine edition from version: $version"
    return 1
  fi
}

# https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase#using-the-migrate-down-command
# Run a single migrate down step (rolls back exactly one major version)
# This function is idempotent - it takes a version string and handles everything internally.
migrate_down_step() {
  local version="$1"
  local image is_head="false"

  # Resolve image from version
  image=$(cli image "$version") || return 1
  [[ "$version" == "HEAD" ]] && is_head="true"

  log "Running 'migrate down' for version: $version (image: $image)"

  local output
  local exit_code=0

  # The HEAD Docker image has version "vUNKNOWN" in its version.properties,
  # which causes `migrate down` to fail with a NullPointerException when trying
  # to determine the current major version. To work around this, we extract the
  # JAR, replace version.properties with the upcoming version, and mount the
  # modified JAR.
  #
  # HEAD is the next major version (CURRENT_VERSION + 1).
  #
  # See DEV-1636 for a potential backend fix that would make this unnecessary.
  if [[ "$is_head" == "true" ]]; then
    if [[ -z "$CURRENT_VERSION" ]]; then
      error "CURRENT_VERSION must be set when testing HEAD downgrades"
      return 1
    fi
    local next_version=$((CURRENT_VERSION + 1))
    local upcoming_version="v1.${next_version}.0"
    local work_dir="/tmp/metabase-head-jar"
    local modified_jar="$work_dir/metabase.jar"

    log "HEAD JAR needs patching (version.properties says 'vUNKNOWN', setting to $upcoming_version)"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"

    # Extract JAR from container (copy to host with proper permissions)
    docker create --name metabase-jar-extract "$image" >/dev/null
    docker cp metabase-jar-extract:/app/metabase.jar "$modified_jar"
    docker rm metabase-jar-extract >/dev/null

    # Create version.properties with upcoming version and update the JAR
    echo "tag=$upcoming_version" > "$work_dir/version.properties"
    echo "hash=HEAD" >> "$work_dir/version.properties"
    echo "date=$(date +%Y-%m-%d)" >> "$work_dir/version.properties"
    (cd "$work_dir" && zip -u metabase.jar version.properties >/dev/null)

    log "HEAD JAR patched - proceeding with migrate down"

    output=$(METABASE_IMAGE="$image" docker compose run --rm --quiet-pull \
      -v "$modified_jar:/app/metabase.jar:ro" \
      metabase "migrate down" 2>&1) || exit_code=$?
  else
    output=$(METABASE_IMAGE="$image" docker compose run --rm --quiet-pull metabase "migrate down" 2>&1) || exit_code=$?
  fi

  # Always print output for visibility
  echo "$output"

  # Check for errors - Metabase returns 0 even on partial rollback failures
  if [[ $exit_code -ne 0 ]]; then
    error "migrate down failed with exit code $exit_code"
    return 1
  fi

  if echo "$output" | grep -q "ERROR.*liquibase\|RollbackFailedException\|Command failed with exception"; then
    error "migrate down encountered errors (check logs above)"
    return 1
  fi

  if echo "$output" | grep -q "not rolled back"; then
    error "migrate down had changesets that were not rolled back (check logs above)"
    return 1
  fi
}

# Cascading migrate down: rolls back multiple major versions one at a time
# Metabase only supports rolling back one major version per `migrate down` call,
# so we need to iterate through intermediate versions.
cascading_migrate_down() {
  local source_version="$1"
  local target_version="$2"

  local source_major target_major edition_prefix
  source_major=$(cli major "$source_version") || return 1
  target_major=$(cli major "$target_version") || return 1
  edition_prefix=$(get_edition_prefix "$source_version") || return 1

  local steps=$((source_major - target_major))
  log "Cascading migrate down: v$source_major → v$target_major ($steps step(s))"

  # Build version sequence: source version first, then intermediate rolling versions
  local versions=("$source_version")
  local current=$((source_major - 1))
  while (( current > target_major )); do
    versions+=("v${edition_prefix}.${current}.x")
    ((current--))
  done

  # Simple loop - each step handles its own image resolution
  local step=1
  for version in "${versions[@]}"; do
    log "--------------------------------------------"
    log "Cascade step $step/$steps: $version"
    log "--------------------------------------------"
    if ! migrate_down_step "$version"; then
      error "Migrate down failed at step $step ($version)"
      return 1
    fi
    ((step++))
  done

  log "--------------------------------------------"
  log "Cascading migrate down complete"
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
    error "❌ SOURCE version ($SOURCE_VERSION) failed health check"
    docker compose logs metabase
    write_failure "migration"
    exit 1
  fi

  log "✅ SOURCE version ($SOURCE_VERSION) is healthy"

  log ""
  log "Step 2: Running e2e tests (@source)..."
  if ! run_e2e source "$SOURCE_VERSION"; then
    write_failure "e2e"
    exit 1
  fi

  log ""
  log "Step 3: Stopping SOURCE version ($SOURCE_VERSION)..."
  stop_metabase

  log ""
  log "Step 4: Starting TARGET version ($TARGET_VERSION)..."
  start_metabase "$target_image"

  if [[ "$direction" == "upgrade" ]]; then
    # Upgrade: should migrate automatically and become healthy
    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "❌ TARGET version ($TARGET_VERSION) failed health check after upgrade"
      docker compose logs metabase
      write_failure "migration"
      exit 1
    fi
    log "✅ UPGRADE successful - TARGET version ($TARGET_VERSION) is healthy"

    log ""
    log "Step 5: Running e2e tests (@target)..."
    if ! run_e2e target "$TARGET_VERSION"; then
      write_failure "e2e"
      exit 1
    fi

  else
    # Downgrade: should refuse to start, then we run migrate down
    if ! check_downgrade_refused; then
      error "❌ TARGET version ($TARGET_VERSION) did not properly detect downgrade"
      docker compose logs metabase
      write_failure "migration"
      exit 1
    fi

    # Stop the failed container
    stop_metabase

    log ""
    log "Step 5: Rolling back database ($SOURCE_VERSION → $TARGET_VERSION)..."
    if ! cascading_migrate_down "$SOURCE_VERSION" "$TARGET_VERSION"; then
      error "❌ migrate down failed"
      write_failure "migration"
      exit 1
    fi

    # Try starting again
    log ""
    log "Step 6: Starting TARGET version ($TARGET_VERSION) after migrate down..."
    start_metabase "$target_image"

    if ! wait_for_health "$HEALTH_TIMEOUT"; then
      error "❌ TARGET version ($TARGET_VERSION) failed health check after migrate down"
      docker compose logs metabase
      write_failure "migration"
      exit 1
    fi
    log "✅ DOWNGRADE successful - TARGET version ($TARGET_VERSION) is healthy after migrate down"

    log ""
    log "Step 7: Running e2e tests (@target)..."
    if ! run_e2e target "$TARGET_VERSION"; then
      write_failure "e2e"
      exit 1
    fi
  fi

  log ""
  log "============================================"
  log "✅ TEST PASSED"
  log "============================================"
}

main
