#!/usr/bin/env bash
# Stop v62, then boot the H2-stripped v63 test image against the SAME app DB. On boot it should
# run replace-sample-database! and migrate the H2 sample DB to SQLite.
set -euo pipefail
. "$(dirname "$0")/config.sh"

echo "== Stopping v62 container (app DB volume preserved) =="
docker rm -f "$MB_CONTAINER" >/dev/null 2>&1 || true

echo "== Running v63 test image: $V63_IMAGE =="
docker run -d --name "$MB_CONTAINER" --network "$NET" -p "$MB_PORT:3000" \
  -e MB_DB_TYPE=postgres -e MB_DB_HOST="$PG_HOST" -e MB_DB_PORT=5432 \
  -e MB_DB_DBNAME="$PG_DB" -e MB_DB_USER="$PG_USER" -e MB_DB_PASS="$PG_PASS" \
  ${MB_PREMIUM_EMBEDDING_TOKEN:+-e MB_PREMIUM_EMBEDDING_TOKEN="$MB_PREMIUM_EMBEDDING_TOKEN"} \
  "$V63_IMAGE"

wait_for_health 300
echo
echo ">> v63 up at http://localhost:$MB_PORT"
echo ">> Sample-DB migration log lines:"
docker logs "$MB_CONTAINER" 2>&1 | grep -iE 'sample database|replacing the sample|engine changed' || echo "  (none matched — inspect: docker logs $MB_CONTAINER)"
echo ">> Scanning logs for H2 ClassNotFound (should be empty):"
docker logs "$MB_CONTAINER" 2>&1 | grep -iE 'ClassNotFound.*h2|org\.h2' || echo "  none — good"
echo
echo ">> Now do the MANUAL.md 'After 05' verification."
