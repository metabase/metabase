#!/usr/bin/env bash
#
# Run cross-version e2e tests
#
# Called by cross-version/test.sh - assumes Metabase is already running.
#
# Usage:
#   ./run.sh --phase source    # Run setup tests (creates data)
#   ./run.sh --phase target    # Run verification tests (checks data survived)
#
# Environment variables:
#   CYPRESS_BASE_URL  - Metabase instance URL (default: http://localhost:3000)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PHASE=""

usage() {
  echo "Usage: $0 --phase <source|target>"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --phase) PHASE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

[[ -z "$PHASE" ]] && { echo "Error: --phase is required"; usage; }
[[ "$PHASE" != "source" && "$PHASE" != "target" ]] && { echo "Error: --phase must be 'source' or 'target'"; usage; }

cd "$PROJECT_ROOT"

export CYPRESS_BASE_URL="${CYPRESS_BASE_URL:-http://localhost:3000}"

CYPRESS_ARGS=(
  --config-file "e2e/cross-version/cypress.config.js"
  --env "grepTags=@${PHASE}"
)

if [[ -n "${CYPRESS_SPEC_PATTERN:-}" ]]; then
  echo "[cypress] Running @${PHASE} tests from ${CYPRESS_SPEC_PATTERN}"
  CYPRESS_ARGS+=(--config "specPattern=${CYPRESS_SPEC_PATTERN}")
else
  echo "[cypress] Running @${PHASE} tests against ${CYPRESS_BASE_URL}"
fi

bunx cypress run "${CYPRESS_ARGS[@]}"
