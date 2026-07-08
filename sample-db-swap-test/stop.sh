#!/usr/bin/env bash
# Stop the running Metabase. Pass --clean to also wipe the work dir (app-db, plugins, logs) for a fresh run.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${HERE}/config.sh"; . "${HERE}/lib.sh"

stop_mb
if [ "${1:-}" = "--clean" ]; then
  echo ">> removing ${WORK_DIR}"
  rm -rf "${WORK_DIR}"
fi
echo "stopped."
