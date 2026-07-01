#!/usr/bin/env bash
# Remove containers, network, and (optionally) the app DB volume + build artifacts.
set -euo pipefail
. "$(dirname "$0")/config.sh"

docker rm -f "$MB_CONTAINER" "$PG_CONTAINER" >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true

if [ "${1:-}" = "--all" ]; then
  echo "Removing app DB volume $PG_VOLUME and build dir"
  docker volume rm "$PG_VOLUME" >/dev/null 2>&1 || true
  rm -rf "$BUILD_DIR"
else
  echo "Kept volume $PG_VOLUME and build dir. Pass --all to wipe them too."
fi
echo "Teardown done."
