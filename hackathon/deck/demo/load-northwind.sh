#! /usr/bin/env bash
# Load B's golden (northwind) corpus into the :3050 demo instance through the REST API.
# Reuses the existing northwind_warehouse DB READ-ONLY (B: never re-run warehouse.sql against it; it drops the schema).
# The manifest goes into the Riley worktree's local/, never over ../artifacts/golden/manifest.json.
set -euo pipefail
HARNESS_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RILEY="${RILEY_WORKTREE:-$(cd "$HARNESS_REPO/.." && pwd)/riley-duplicates}"
DIR="$RILEY/local/demo-northwind$( [ "${DEMO_STORE:-pgvector}" = pgvector ] && echo -pg || true )"
PORT="${DEMO_PORT:-3050}"
curl -sf "http://localhost:$PORT/api/health" | grep -q '"ok"' || { echo "demo northwind is not up on :$PORT" >&2; exit 1; }
cd "$HARNESS_REPO/hackathon/harness/corpus-gen"
node apply.ts --corpus ../artifacts/golden/corpus.json \
  --url "http://localhost:$PORT" --user demo-admin@example.com --password "$(cat "$DIR/.admin-password")" \
  --pg-host localhost --pg-port 55432 --pg-db northwind_warehouse --pg-user postgres --pg-password postgres \
  --out "$DIR/manifest.json"
