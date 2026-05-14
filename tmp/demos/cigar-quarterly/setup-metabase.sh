#!/usr/bin/env bash
# tmp/demos/cigar-quarterly/setup-metabase.sh
set -euo pipefail

MB_URL="${MB_URL:-http://localhost:3040}"
MB_USER="${MB_USER:-ngoc@slides.local}"
MB_PASS="${MB_PASS:-slides12345!ABC}"

METABASE_IDS="tmp/demos/cigar-quarterly/.metabase-ids"

echo "1/6  Login"
SESSION=$(curl -sf -X POST "$MB_URL/api/session" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$MB_USER\",\"password\":\"$MB_PASS\"}" | jq -r .id)
auth=( -H "X-Metabase-Session: $SESSION" -H "Content-Type: application/json" )

if [[ -f "$METABASE_IDS" ]]; then
  source "$METABASE_IDS"
  echo "2/6  Re-using existing DB_ID=$DB_ID"
else
  echo "2/6  Attach Corleone Cigars Imports (Postgres)"
  DB_ID=$(curl -sf -X POST "$MB_URL/api/database" "${auth[@]}" -d '{
    "name": "Corleone Cigars Imports",
    "engine": "postgres",
    "details": {
      "host": "localhost",
      "port": 5432,
      "dbname": "corleone_cigars",
      "user": "'"$USER"'",
      "ssl": false
    },
    "is_full_sync": true,
    "is_on_demand": false
  }' | jq -r .id)
  echo "    DB_ID=$DB_ID"

  echo "3/6  Trigger sync + wait"
  curl -sf -X POST "$MB_URL/api/database/$DB_ID/sync_schema" "${auth[@]}" > /dev/null
  for i in $(seq 1 30); do
    SHIPMENTS_TABLE_ID=$(curl -sf "$MB_URL/api/database/$DB_ID/metadata" "${auth[@]}" \
      | jq -r '.tables[] | select(.name=="shipments") | .id' 2>/dev/null || true)
    if [[ -n "$SHIPMENTS_TABLE_ID" ]]; then
      echo "    shipments table id=$SHIPMENTS_TABLE_ID after ${i}s"
      break
    fi
    sleep 1
  done
  [[ -z "${SHIPMENTS_TABLE_ID:-}" ]] && { echo "ERROR: shipments table did not appear after 30s"; exit 1; }

  # Stash these for the card-creation tasks
  echo "DB_ID=$DB_ID"            >  "$METABASE_IDS"
  echo "SESSION=$SESSION"        >> "$METABASE_IDS"
  echo "Setup phase 1 complete. IDs stashed at $METABASE_IDS"
fi

# Re-define auth with the (potentially re-sourced) SESSION
auth=( -H "X-Metabase-Session: $SESSION" -H "Content-Type: application/json" )

echo "4/6  Create cards"
source "$METABASE_IDS"

if grep -q "CARD1_ID" "$METABASE_IDS" 2>/dev/null; then
  echo "    Cards already created, skipping. IDs:"
  grep "CARD._ID" "$METABASE_IDS"
else
  card_native () {
    local name="$1" sql="$2" display="$3" viz_json="$4"
    curl -sf -X POST "$MB_URL/api/card" "${auth[@]}" -d "$(jq -n --arg n "$name" --arg s "$sql" --arg d "$display" --argjson v "$viz_json" --argjson db "$DB_ID" '{
      name: $n, display: $d, database_id: $db,
      dataset_query: { type: "native", database: $db, native: { query: $s, "template-tags": {} } },
      visualization_settings: $v
    }')" | jq -r .id
  }

  CARD1_ID=$(card_native "Monthly revenue, FY26 vs. FY25" "$(cat <<'SQL'
SELECT
  date_trunc('month', ship_date)::date AS month,
  CASE
    WHEN ship_date >= DATE '2025-04-01' AND ship_date < DATE '2026-04-01' THEN 'FY26'
    ELSE 'FY25'
  END AS fiscal_year,
  SUM(revenue_usd) AS revenue
FROM shipments
WHERE ship_date >= DATE '2024-04-01' AND ship_date < DATE '2026-04-01'
GROUP BY 1, 2
ORDER BY 1;
SQL
)" "line" '{
  "graph.dimensions": ["month", "fiscal_year"],
  "graph.metrics": ["revenue"],
  "graph.x_axis.title_text": "Month",
  "graph.y_axis.title_text": "Revenue (USD)"
}')
  echo "    CARD1_ID=$CARD1_ID"

  CARD2_ID=$(card_native "Top 5 SKUs by Q4 revenue" "$(cat <<'SQL'
SELECT k.name AS sku, SUM(s.revenue_usd) AS revenue
FROM shipments s
JOIN skus k ON k.id = s.sku_id
WHERE s.ship_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31'
GROUP BY k.name
ORDER BY revenue DESC
LIMIT 5;
SQL
)" "row" '{
  "graph.dimensions": ["sku"],
  "graph.metrics": ["revenue"]
}')
  echo "    CARD2_ID=$CARD2_ID"

  # Resolve column IDs we need for MBQL
  META=$(curl -sf "$MB_URL/api/database/$DB_ID/metadata" "${auth[@]}")
  SHIP_TABLE_ID=$(echo "$META" | jq -r '.tables[] | select(.name=="shipments") | .id')
  SHIP_REGION_ID=$(echo "$META" | jq -r --argjson t "$SHIP_TABLE_ID" '.tables[] | select(.id==$t) | .fields[] | select(.name=="region") | .id')
  SHIP_REV_ID=$(echo "$META" | jq -r --argjson t "$SHIP_TABLE_ID" '.tables[] | select(.id==$t) | .fields[] | select(.name=="revenue_usd") | .id')
  SHIP_DATE_ID=$(echo "$META" | jq -r --argjson t "$SHIP_TABLE_ID" '.tables[] | select(.id==$t) | .fields[] | select(.name=="ship_date") | .id')
  SHIP_DIST_ID=$(echo "$META" | jq -r --argjson t "$SHIP_TABLE_ID" '.tables[] | select(.id==$t) | .fields[] | select(.name=="distributor_id") | .id')

  DIST_TABLE_ID=$(echo "$META" | jq -r '.tables[] | select(.name=="distributors") | .id')
  DIST_NICKNAME_ID=$(echo "$META" | jq -r --argjson t "$DIST_TABLE_ID" '.tables[] | select(.id==$t) | .fields[] | select(.name=="nickname") | .id')

  CARD3_ID=$(curl -sf -X POST "$MB_URL/api/card" "${auth[@]}" -d "$(jq -n \
    --argjson db "$DB_ID" --argjson t "$SHIP_TABLE_ID" \
    --argjson region "$SHIP_REGION_ID" --argjson rev "$SHIP_REV_ID" \
    --argjson date_id "$SHIP_DATE_ID" --argjson dist_id "$SHIP_DIST_ID" \
    --argjson dist_nick "$DIST_NICKNAME_ID" '
  {
    name: "Q4 revenue by region (by distributor)",
    display: "bar",
    database_id: $db,
    dataset_query: {
      type: "query",
      database: $db,
      query: {
        "source-table": $t,
        "filter": ["between", ["field", $date_id, null], "2026-01-01", "2026-03-31"],
        "aggregation": [["sum", ["field", $rev, null]]],
        "breakout": [
          ["field", $region, null],
          ["field", $dist_nick, {"source-field": $dist_id}]
        ]
      }
    },
    visualization_settings: {
      "stackable.stack_type": "stacked",
      "graph.dimensions": ["region", "nickname"],
      "graph.metrics": ["sum"]
    }
  }')" | jq -r .id)
  echo "    CARD3_ID=$CARD3_ID"

  CARD4_ID=$(card_native "FY27 projected revenue by region" "$(cat <<'SQL'
WITH fy26 AS (
  SELECT region, SUM(revenue_usd) AS revenue
  FROM shipments
  WHERE ship_date >= DATE '2025-04-01' AND ship_date < DATE '2026-04-01'
  GROUP BY region
)
SELECT region, ROUND(revenue * 1.12, 2) AS projected_revenue FROM fy26
UNION ALL
SELECT 'Sicily' AS region, 850000.00 AS projected_revenue
ORDER BY projected_revenue DESC;
SQL
)" "bar" '{
  "graph.dimensions": ["region"],
  "graph.metrics": ["projected_revenue"]
}')
  echo "    CARD4_ID=$CARD4_ID"

  # Persist card IDs for dashboard task
  {
    echo "CARD1_ID=$CARD1_ID"
    echo "CARD2_ID=$CARD2_ID"
    echo "CARD3_ID=$CARD3_ID"
    echo "CARD4_ID=$CARD4_ID"
  } >> "$METABASE_IDS"
fi

if grep -q '^DASH_ID=' "$METABASE_IDS" 2>/dev/null; then
  source "$METABASE_IDS"
  echo "5/6  Dashboard already created (DASH_ID=$DASH_ID), skipping"
else
  echo "5/6  Create dashboard 'FY26 Q4 Board Review'"
  source "$METABASE_IDS"

  DASH_ID=$(curl -sf -X POST "$MB_URL/api/dashboard" "${auth[@]}" -d '{
    "name": "FY26 Q4 Board Review",
    "description": "Quarterly review for the family. Numbers do not lie."
  }' | jq -r .id)
  echo "    DASH_ID=$DASH_ID"

  curl -sf -X PUT "$MB_URL/api/dashboard/$DASH_ID" "${auth[@]}" -d "$(jq -n \
    --argjson c1 "$CARD1_ID" --argjson c2 "$CARD2_ID" \
    --argjson c3 "$CARD3_ID" --argjson c4 "$CARD4_ID" '
  {
    dashcards: [
      { id: -1, card_id: $c1, col: 0,  row: 0,  size_x: 24, size_y: 6 },
      { id: -2, card_id: $c2, col: 0,  row: 6,  size_x: 12, size_y: 6 },
      { id: -3, card_id: $c3, col: 12, row: 6, size_x: 12, size_y: 6 },
      { id: -4, card_id: $c4, col: 0,  row: 12, size_x: 24, size_y: 6 }
    ]
  }')" > /dev/null

  echo "DASH_ID=$DASH_ID" >> "$METABASE_IDS"
fi

echo "6/6  Dashboard ready: $MB_URL/dashboard/$DASH_ID"
echo "Setup complete. IDs at $METABASE_IDS"
