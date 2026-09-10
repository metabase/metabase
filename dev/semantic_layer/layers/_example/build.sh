#!/usr/bin/env bash
# Skeleton for a generated layer. load.py runs this with:
#   MB_PROFILE  (mb profile for the harness instance)   MB_URL
#   SL_SCHEMA   (warehouse schema this layer covers)     SL_WAREHOUSE_DB_ID (Metabase database id)
#   SL_LAYER_DIR (this directory; put body JSON files next to this script)
# Every call must be idempotent-enough to replay after `make reset` (the instance is pristine each time).
# Order matters: transform outputs must exist and be synced before anything references them.
set -euo pipefail
cd "$SL_LAYER_DIR"
P=(--profile "$MB_PROFILE")
DB="$SL_WAREHOUSE_DB_ID"

# 1. transforms (OLTP -> analysis-ready tables), run them, then sync so the outputs are real tables
# T1=$(mb transform create --file transforms/fact_rentals.json "${P[@]}" --json | jq -r .id)
# mb transform run "$T1" --wait "${P[@]}"
# mb db sync-schema "$DB" --wait "${P[@]}"

# 2. publish the tables that make up the layer
# mb library publish --schemas "$DB:$SL_SCHEMA" "${P[@]}"      # or --table-ids a,b,c

# 3. measures, dimensions (field metadata), segments on those tables
# mb measure create --file measures/revenue.json "${P[@]}"
# mb field update <id> --body '{"semantic_type":"type/Category"}' "${P[@]}"
# mb segment create --file segments/active_customers.json "${P[@]}"

# 4. top-level metrics (cards of type metric) into the Library's Metrics collection
# METRICS=$(mb library get "${P[@]}" --json | jq -r .metrics_collection_id)
# mb card create --file metrics/monthly_revenue.json "${P[@]}"

# 5. dashboards built from those metrics
# mb dashboard create --file dashboards/overview.json "${P[@]}"

echo "example layer: nothing to do (copy this directory to layers/<schema>/ and fill it in)"
