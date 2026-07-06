#!/usr/bin/env bash
# Boot the official v62 EE image against the shared Postgres to seed the pre-upgrade state: an H2
# Sample Database, plus an admin user (so the v63 upgrade takes the existing-install code path that
# migrates the sample, rather than the fresh-install path).
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

echo "== Completing admin setup via the API =="
BASE="http://localhost:$MB_PORT"
TOKEN="$(curl -s "$BASE/api/session/properties" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("setup-token") or "")')"
[ -n "$TOKEN" ] || { echo "FAIL: no setup token (already set up?)"; exit 1; }
curl -sf -X POST "$BASE/api/setup" -H 'Content-Type: application/json' -d "{
  \"token\": \"$TOKEN\",
  \"user\": {\"first_name\":\"Test\",\"last_name\":\"Admin\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"site_name\":\"Upgrade Test\"},
  \"prefs\": {\"site_name\":\"Upgrade Test\",\"site_locale\":\"en\",\"allow_tracking\":false}
}" >/dev/null

HAS_USER="$(curl -s "$BASE/api/session/properties" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("has-user-setup"))')"
SAMPLE_ENGINE="$(docker exec -e PGPASSWORD="$PG_PASS" "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "select engine from metabase_database where is_sample;" 2>/dev/null | tr -d '[:space:]')"
echo ">> has-user-setup=$HAS_USER | sample engine=$SAMPLE_ENGINE"
[ "$HAS_USER" = "True" ] && [ "$SAMPLE_ENGINE" = "h2" ] || { echo "FAIL: expected has-user-setup=True and H2 sample"; exit 1; }
echo ">> v62 seeded: admin created, H2 sample present. Ready for the v63 upgrade (05)."
