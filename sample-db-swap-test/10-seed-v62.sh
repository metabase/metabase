#!/usr/bin/env bash
# Step 1: fresh v62. Seeds the H2 sample DB (auto) + user content: an MBQL date-bucketed question and a
# native question using an H2 date function. Then stops v62.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${HERE}/config.sh"; . "${HERE}/lib.sh"

trap stop_mb EXIT
start_jar v62 "${V62_JAR}"
wait_ready
setup_or_login
find_sample_db

echo "== assert: v62 ships an H2 sample database =="
[ "${SAMPLE_ENGINE}" = "h2" ] && echo "PASS: engine = h2" || echo "WARN: expected h2, got ${SAMPLE_ENGINE}"

orders_id="$(sample_table_id ORDERS)"
created_id="$(sample_field_id ORDERS CREATED_AT)"
echo ">> ORDERS table=${orders_id}  CREATED_AT field=${created_id}"

echo "== create MBQL question: count of ORDERS bucketed by CREATED_AT month =="
mbql_card="$(jq -n --argjson db "${SAMPLE_DB_ID}" --argjson tid "${orders_id}" --argjson fid "${created_id}" '{
  name:"MBQL - orders by month", display:"line", visualization_settings:{},
  dataset_query:{database:$db, type:"query",
    query:{"source-table":$tid, aggregation:[["count"]],
           breakout:[["field",$fid,{"temporal-unit":"month"}]]}}}')"
mbql_id="$(create_card "${mbql_card}")"
echo ">> MBQL card id=${mbql_id}  ->  rows=$(run_card "${mbql_id}")"

echo "== create native question using an H2 date function (DATE_TRUNC) =="
native_card="$(jq -n --argjson db "${SAMPLE_DB_ID}" '{
  name:"Native - orders by month (H2 DATE_TRUNC)", display:"table", visualization_settings:{},
  dataset_query:{database:$db, type:"native",
    native:{query:"SELECT DATE_TRUNC('\''month'\'', CREATED_AT) AS month, COUNT(*) AS cnt FROM ORDERS GROUP BY 1 ORDER BY 1"}}}')"
native_id="$(create_card "${native_card}")"
echo ">> native card id=${native_id}  ->  rows=$(run_card "${native_id}")"

save_state
{ echo "MBQL_CARD_ID=${mbql_id}"; echo "NATIVE_CARD_ID=${native_id}"; } >> "${STATE_FILE}"
echo
echo "DONE seeding v62.  MBQL card=${mbql_id}  native card=${native_id}  sample=h2"
echo "Next: ./20-switch-v63.sh"
