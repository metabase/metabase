#! /usr/bin/env bash
# Create mb_stats_demo from B's PRISTINE Stats dump (never from mb_stats_real) and apply B's outbound guards.
# Recipe from B (2026-09-23). Refuses to touch an existing mb_stats_demo unless --recreate is given.
set -euo pipefail
HARNESS_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PG=semantic_search-postgres-1
DB=mb_stats_demo
DUMP="$HARNESS_REPO/local/stats-real/appdb.dump"
GUARDS="$HARNESS_REPO/local/stats-real/guards.sql"
[ -s "$DUMP" ] || { echo "no dump at $DUMP" >&2; exit 1; }

exists=$(docker exec "$PG" psql -U postgres -tAc "select 1 from pg_database where datname = '$DB'")
if [ "$exists" = 1 ]; then
  [ "${1:-}" = --recreate ] || { echo "$DB already exists; pass --recreate to drop and restore it" >&2; exit 1; }
  docker exec "$PG" dropdb -U postgres "$DB"
fi
docker exec "$PG" createdb -U postgres "$DB"
docker exec "$PG" psql -U postgres -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS citext" >/dev/null
docker exec -i "$PG" pg_restore -U postgres -d "$DB" --no-owner --no-privileges < "$DUMP"
docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" < "$GUARDS"
echo "restored $DB; guards applied (expect 0 / 0 0 0 above)"
