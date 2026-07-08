#!/usr/bin/env bash
# Step 2: switch to the v63 branch jar against the SAME app-db. Startup migrates the H2 sample DB to
# SQLite in place (engine + table schema flipped, resynced), preserving all ids. Re-runs the seeded
# cards so you can see what survives, then LEAVES METABASE RUNNING for manual investigation.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${HERE}/config.sh"; . "${HERE}/lib.sh"; load_state

stop_mb                       # make sure v62 is down
start_jar v63 "${V63_JAR}"    # in-place H2 -> SQLite swap happens during startup
wait_ready
setup_or_login
find_sample_db

echo
echo "======================================================================"
echo "== after the in-place swap =="
echo "sample database engine: ${SAMPLE_ENGINE}   (expected: sqlite)"
echo
echo "MBQL card  ${MBQL_CARD_ID:-?}  ->  rows=$(run_card "${MBQL_CARD_ID:-0}")"
echo "  (MBQL is engine-agnostic - the QP recompiles it for SQLite, so this should still work)"
echo
echo "native card ${NATIVE_CARD_ID:-?}  ->  $(run_card "${NATIVE_CARD_ID:-0}")"
echo "  (native SQL is engine-specific - an H2 DATE_TRUNC likely fails on SQLite; that's the thing to investigate)"
echo "======================================================================"
echo
echo "Metabase v63 is RUNNING at ${BASE_URL}   (login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD})"
echo "  MBQL card:   ${BASE_URL}/question/${MBQL_CARD_ID:-}"
echo "  native card: ${BASE_URL}/question/${NATIVE_CARD_ID:-}"
echo "  sample DB:   ${BASE_URL}/browse/databases/${SAMPLE_DB_ID}"
echo
echo "Investigate manually. When done: ./stop.sh"
