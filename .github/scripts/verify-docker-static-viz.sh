#!/usr/bin/env bash
# Renders a chart to PDF inside a built image, as a non-root UID on a read-only root filesystem, and checks the JVM
# loaded the bundled musl JS isolate and libtruffleattach.
#
# Usage: verify-docker-static-viz.sh <image>
set -euo pipefail

image=${1:?usage: $0 <image>}
container=mb-static-viz-check
port=${PORT:-3000}
base=http://localhost:$port

fail() {
  echo "::error::$*" >&2
  docker logs "$container" >&2 2>&1 || true
  exit 1
}

docker rm -f "$container" > /dev/null 2>&1 || true
# /tmp needs exec: the SQLite sample database's JDBC driver unpacks and loads its native library there
docker run -d --name "$container" \
  --user 12345:0 --read-only --tmpfs /tmp:rw,exec,size=1g \
  -e MB_DB_FILE=/tmp/metabase.db -e MB_PLUGINS_DIR=/tmp/plugins \
  -p "$port:3000" "$image" > /dev/null

echo "Waiting for Metabase to start"
for _ in $(seq 1 300); do
  if curl -fs "$base/api/health" | grep -q '"status":"ok"'; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$container")" != true ]; then fail "container exited during startup"; fi
  sleep 1
done
curl -fs "$base/api/health" | grep -q '"status":"ok"' || fail "Metabase didn't become healthy"

api() {
  local method=$1 path=$2 body=${3:-}
  curl -fsS --max-time "${MAX_TIME:-60}" -X "$method" "$base/api$path" \
    -H 'Content-Type: application/json' \
    ${session:+-H "X-Metabase-Session: $session"} \
    ${body:+-d "$body"} || fail "$method $path failed"
}

setup_token=$(api GET /session/properties | jq -r '."setup-token"')
session=$(api POST /setup "$(jq -n --arg token "$setup_token" '{
  token: $token,
  user:  {email: "static-viz@example.com", password: "Sm0ke-test-static-viz!", first_name: "Static", last_name: "Viz",
          site_name: "static-viz"},
  prefs: {site_name: "static-viz", allow_tracking: false}
}')" | jq -r .id)
[ -n "$session" ] && [ "$session" != null ] || fail "setup didn't return a session"

db_id=$(api GET /database | jq -r '[.data[] | select(.is_sample)][0].id')
[ -n "$db_id" ] && [ "$db_id" != null ] || fail "sample database not found"

card_id=$(api POST /card "$(jq -n --argjson db "$db_id" '{
  name: "Static viz smoke test",
  display: "bar",
  visualization_settings: {"graph.dimensions": ["CATEGORY"], "graph.metrics": ["N"]},
  dataset_query: {database: $db, type: "native",
                  native: {query: "SELECT CATEGORY, COUNT(*) AS N FROM PRODUCTS GROUP BY CATEGORY ORDER BY CATEGORY"}}
}')" | jq -r .id)

dashboard_id=$(api POST /dashboard '{"name": "Static viz smoke test"}' | jq -r .id)
api PUT "/dashboard/$dashboard_id" "$(jq -n --argjson card "$card_id" '{
  dashcards: [{id: -1, card_id: $card, row: 0, col: 0, size_x: 12, size_y: 8}]
}')" > /dev/null

echo "Rendering dashboard $dashboard_id to PDF"
pdf=$(mktemp)
MAX_TIME=300 api POST "/dashboard/$dashboard_id/pdf" '{}' > "$pdf" || fail "rendering the dashboard to PDF failed or timed out"
head -c 5 "$pdf" | grep -q '%PDF-' || fail "the PDF endpoint didn't return a PDF"

# A failed query or chart is rendered as an error placeholder inside a valid PDF, so check the logs too.
logs=$(docker logs "$container" 2>&1)
if echo "$logs" | grep -E 'Error processing query|Pulse card query error'; then
  fail "the chart's query failed, so nothing was rendered"
fi
if echo "$logs" | grep -E 'Pulse card render error|UnsatisfiedLinkError|libtruffleattach could not be loaded'; then
  fail "chart rendering failed inside the image"
fi

# Java runs as PID 1 when the container starts as non-root (run_metabase.sh execs it).
maps=$(docker exec "$container" cat /proc/1/maps)
echo "$maps" | grep -q '/app/js-isolate/libpolyglotisolate.so' || fail "the JVM didn't load /app/js-isolate/libpolyglotisolate.so"
echo "$maps" | grep -q '/app/truffle-attach/bin/libtruffleattach.so' || fail "the JVM didn't load /app/truffle-attach/bin/libtruffleattach.so"

echo "Static-viz rendered in $(docker inspect -f '{{.Architecture}}' "$image") image, as a non-root user on a read-only root filesystem"
