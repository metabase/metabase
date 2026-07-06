#!/usr/bin/env bash
# Stop v62, boot the H2-stripped v63 image against the SAME app DB, then verify the upgrade:
#   - boots healthy on a Postgres app DB with H2 fully removed (classes + driver registration),
#   - migrates the H2 Sample Database to SQLite and syncs it,
#   - no H2 ClassNotFound / "No suitable driver" errors,
#   - existing admin user preserved, sample DB queryable.
# Exits non-zero (with a FAIL line) if any check fails.
set -euo pipefail
. "$(dirname "$0")/config.sh"

echo "== Stopping v62 (app DB volume preserved), booting v63 image: $V63_IMAGE =="
docker rm -f "$MB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$MB_CONTAINER" --network "$NET" -p "$MB_PORT:3000" \
  -e MB_DB_TYPE=postgres -e MB_DB_HOST="$PG_HOST" -e MB_DB_PORT=5432 \
  -e MB_DB_DBNAME="$PG_DB" -e MB_DB_USER="$PG_USER" -e MB_DB_PASS="$PG_PASS" \
  ${MB_PREMIUM_EMBEDDING_TOKEN:+-e MB_PREMIUM_EMBEDDING_TOKEN="$MB_PREMIUM_EMBEDDING_TOKEN"} \
  "$V63_IMAGE"

wait_for_health 300

echo "== Verifying upgrade =="
psql_q() { docker exec -e PGPASSWORD="$PG_PASS" "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
fails=0
check() { # <name> <actual> <expected-test...>  e.g. check "sample engine" "$e" = sqlite
  local name="$1" actual="$2"; shift 2
  if [ "$actual" "$@" ]; then echo "  PASS: $name ($actual)"; else echo "  FAIL: $name -> got '$actual', expected [$*]"; fails=$((fails+1)); fi
}

check "sample engine migrated to sqlite" "$(psql_q "select engine from metabase_database where is_sample;")" = sqlite
check "no H2 warehouse DBs remain"       "$(psql_q "select count(*) from metabase_database where engine='h2';")" = 0
check "sample tables synced (>0)"        "$(psql_q "select count(*) from metabase_table t join metabase_database d on t.db_id=d.id where d.is_sample;")" -gt 0
check "sample fields synced (>0)"        "$(psql_q "select count(*) from metabase_field f join metabase_table t on f.table_id=t.id join metabase_database d on t.db_id=d.id where d.is_sample;")" -gt 0
check "admin user preserved"             "$(psql_q "select count(*) from core_user where is_active;")" -gt 0

h2err="$(docker logs "$MB_CONTAINER" 2>&1 | grep -icE 'ClassNotFound.*org\.h2|No suitable driver' || true)"
check "no H2 ClassNotFound / no-suitable-driver in logs" "$h2err" = 0

# Sample DB is queryable via the API (login as the preserved admin, list databases).
BASE="http://localhost:$MB_PORT"
SID="$(curl -s -X POST "$BASE/api/session" -H 'Content-Type: application/json' -d "{\"username\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id") or "")')"
sample_api_engine="$(curl -s "$BASE/api/database" -H "X-Metabase-Session: $SID" | python3 -c 'import sys,json;d=json.load(sys.stdin);dbs=d.get("data",d);print(next((x["engine"] for x in (dbs if isinstance(dbs,list) else []) if x.get("is_sample")),""))')"
check "login works + sample DB reachable via API" "$sample_api_engine" = sqlite

echo
docker logs "$MB_CONTAINER" 2>&1 | grep -iE 'engine changed from :h2 to :sqlite|Recreated Sample Database example content' | sed 's/^/  log: /' || true
echo
if [ "$fails" -eq 0 ]; then
  echo "===== RESULT: PASS — v63 boots on Postgres with H2 fully removed and migrates the sample to SQLite ====="
else
  echo "===== RESULT: FAIL ($fails check(s)) — inspect: docker logs $MB_CONTAINER ====="; exit 1
fi
