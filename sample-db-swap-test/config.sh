#!/usr/bin/env bash
# Shared config for the H2->SQLite sample-database in-place swap test.
#   v62 (H2 sample DB) --seed content--> switch to v63 branch jar (in-place swaps H2 -> SQLite at startup)
# Both jars share ONE application DB + plugins dir and run one at a time. Override anything via the env.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WORK_DIR="${WORK_DIR:-${REPO_DIR}/sample-db-swap-test/.work}"
LOG_DIR="${LOG_DIR:-${WORK_DIR}/logs}"
mkdir -p "${WORK_DIR}" "${LOG_DIR}"

V62_JAR="${V62_JAR:-${REPO_DIR}/jars/metabase_1.62.2.jar}"
V63_JAR="${V63_JAR:-${REPO_DIR}/jars/metabase_branch_GHY-4069-minimal-migration-approach_ff4c99bfbde76111815365b026a48d168ef1722b.jar}"

# One shared H2 file app-db (self-contained) + one shared plugins dir (sample DB extracted here).
export MB_DB_TYPE="${MB_DB_TYPE:-h2}"
export MB_DB_FILE="${MB_DB_FILE:-${WORK_DIR}/metabase-appdb.db}"
export MB_PLUGINS_DIR="${MB_PLUGINS_DIR:-${WORK_DIR}/plugins}"
mkdir -p "${MB_PLUGINS_DIR}"

export MB_JETTY_PORT="${MB_JETTY_PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:${MB_JETTY_PORT}}"
READY_TIMEOUT="${READY_TIMEOUT:-300}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Test1234!}"

STATE_FILE="${STATE_FILE:-${WORK_DIR}/state.env}"
PID_FILE="${PID_FILE:-${WORK_DIR}/mb.pid}"

command -v jq   >/dev/null || { echo "FATAL: jq required (brew install jq)";  exit 1; }
command -v curl >/dev/null || { echo "FATAL: curl required"; exit 1; }
