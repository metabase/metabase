#!/usr/bin/env bash
# Start Metabase (from source) on a fresh H2 app DB with semantic search backed by the SQLite vec1 store.
# PLAN_002 phase E. Usage, from the repo root:
#
#   native/vec1/e2e/run.sh            # fresh: deletes $E2E_DIR first
#   KEEP=1 native/vec1/e2e/run.sh     # restart on the existing app DB + store
#   SQLITE=0 KEEP=1 native/vec1/e2e/run.sh   # kill switch: same app DB, no SQLite store
#
# Needs in the environment (not printed): MB_PREMIUM_EMBEDDING_TOKEN (with the semantic-search feature) and an
# embedder, e.g. MB_EE_EMBEDDING_SERVICE_BASE_URL + MB_EE_EMBEDDING_SERVICE_API_KEY.
set -euo pipefail

E2E_DIR=${E2E_DIR:-/tmp/mb-sqlite-e2e}
PORT=${PORT:-3055}

for v in MB_PREMIUM_EMBEDDING_TOKEN; do
  [[ -n "${!v:-}" ]] || { echo "missing $v" >&2; exit 1; }
done
[[ -n "${MB_EE_EMBEDDING_SERVICE_BASE_URL:-}${MB_EE_EMBEDDING_PROVIDER:-}" ]] || { echo "no embedder configured" >&2; exit 1; }

[[ "${KEEP:-0}" == 1 ]] || rm -rf "$E2E_DIR"
mkdir -p "$E2E_DIR"

# none of these may leak in from a dev shell: another app DB, pgvector, a forced engine, another port
unset MB_DB_DBNAME MB_DB_HOST MB_DB_PASS MB_DB_PORT MB_DB_USER MB_DB_CONNECTION_URI MB_PGVECTOR_DB_URL MB_SEARCH_ENGINE
export MB_DB_TYPE=h2 MB_DB_FILE="$E2E_DIR/metabase" MB_JETTY_PORT="$PORT"
if [[ "${SQLITE:-1}" == 1 ]]; then
  export MB_SEMANTIC_SEARCH_SQLITE_PATH="$E2E_DIR/semantic.db"
else
  unset MB_SEMANTIC_SEARCH_SQLITE_PATH
fi

echo "app DB: $MB_DB_FILE  store: ${MB_SEMANTIC_SEARCH_SQLITE_PATH:-<off>}  port: $PORT"
exec clojure -M:ee:run
