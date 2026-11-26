#!/usr/bin/env bash
# Builds this dbt + MetricFlow project on DuckDB and regenerates ../results.generated.ts,
# which the "dbt exploration" prototype renders. Needs uv.
# The venv, DuckDB file and dbt target/ live in the repo's gitignored local/ dir, not here.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$(dirname "$SRC")/results.generated.ts"
WORK="$(git -C "$SRC" rev-parse --show-toplevel)/local/dbt_exploration"
mkdir -p "$WORK"
rsync -a --delete --exclude .venv --exclude target --exclude logs --exclude '*.duckdb*' \
  --exclude out "$SRC/" "$WORK/"
cd "$WORK"
export DBT_PROFILES_DIR=.
[ -x .venv/bin/mf ] || { uv venv -q --python 3.12 && uv pip install -q "dbt-metricflow[dbt-duckdb]"; }
.venv/bin/dbt build -q
mkdir -p out
METRICS=revenue,billable_hours,revenue_per_billable_hour
.venv/bin/mf query --metrics $METRICS --group-by metric_time__month \
  --order metric_time__month --csv out/by_month.csv > /dev/null
.venv/bin/mf query --metrics $METRICS --group-by metric_time__month,customer__customer_name \
  --order metric_time__month,customer__customer_name --csv out/by_month_customer.csv > /dev/null
.venv/bin/mf query --metrics revenue_per_billable_hour \
  --group-by metric_time__month,customer__customer_name --explain 2>&1 \
  | sed -n '/^WITH/,$p' > out/generated.sql
.venv/bin/python -I generate.py "$WORK" "$OUT"
bunx oxfmt --write "$OUT" > /dev/null

# DuckDB-Wasm engine for the prototype's SQL console, served by Metabase.
REPO="$(git -C "$SRC" rev-parse --show-toplevel)"
ASSETS="$REPO/resources/frontend_client/app/dist/duckdb"
DIST="$REPO/node_modules/@duckdb/duckdb-wasm/dist"
mkdir -p "$ASSETS"
cp "$DIST/duckdb-eh.wasm" "$DIST/duckdb-browser-eh.worker.js" "$ASSETS/"
echo "Wrote $OUT"
