#!/usr/bin/env bash
# Boot the official v62 EE image against the shared Postgres. This seeds the app DB with an
# H2 Sample Database (the pre-upgrade state).
set -euo pipefail
. "$(dirname "$0")/config.sh"

docker rm -f "$MB_CONTAINER" >/dev/null 2>&1 || true

echo "== Running v62 upgrade source: metabase/metabase-enterprise:$EE_BASE_TAG =="
docker run -d --name "$MB_CONTAINER" --network "$NET" -p "$MB_PORT:3000" \
  -e MB_DB_TYPE=postgres -e MB_DB_HOST="$PG_HOST" -e MB_DB_PORT=5432 \
  -e MB_DB_DBNAME="$PG_DB" -e MB_DB_USER="$PG_USER" -e MB_DB_PASS="$PG_PASS" \
  ${MB_PREMIUM_EMBEDDING_TOKEN:+-e MB_PREMIUM_EMBEDDING_TOKEN="$MB_PREMIUM_EMBEDDING_TOKEN"} \
  "metabase/metabase-enterprise:$EE_BASE_TAG"

wait_for_health 300
echo
echo ">> v62 up at http://localhost:$MB_PORT  — now do the MANUAL.md 'After 04' steps."
