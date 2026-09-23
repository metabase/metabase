#! /usr/bin/env bash
# Throwaway demo instance of Riley's semantic-duplicates branch.
#
#   hackathon/deck/demo/launch.sh northwind   # :3050, fresh H2 app DB; load the golden corpus afterwards (DEMO.md)
#   hackathon/deck/demo/launch.sh stats       # :3051, app DB = mb_stats_demo (restored copy of B's Stats snapshot)
#
# DEMO_STORE=pgvector (default) or sqlite. Riley's embedding map (GET /api/ee/semantic-search/projection) reads pgvector
# only (it returns no points on the sqlite store), and on sqlite the duplicates backfill counts Usage-analytics cards the
# index never holds, so it fails with "has not caught up" (J, 2026-09-23). Use pgvector to show Riley's features.
# pgvector: a per-instance DB mb_demo_<which>_vec in the semantic_search-postgres-1 container (created if missing).
#
# Runs in the foreground (Ctrl-C stops it). Log: <instance dir>/metabase.log.
# Instance dirs (app DB, sqlite store, admin config + password) live in the Riley worktree's git-ignored local/.
# Retries the boot up to 3 times when the license token check fails (flaky network), like the harness pipeline.
set -euo pipefail

WHICH="${1:?usage: launch.sh northwind|stats}"
HARNESS_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RILEY="${RILEY_WORKTREE:-$(cd "$HARNESS_REPO/.." && pwd)/riley-duplicates}"
STORE="${DEMO_STORE:-pgvector}"
case "$STORE" in pgvector|sqlite) ;; *) echo "ERROR: DEMO_STORE must be pgvector or sqlite" >&2; exit 1 ;; esac
DIR="$RILEY/local/demo-$WHICH$( [ "$STORE" = pgvector ] && echo -pg || true )"
mkdir -p "$DIR"

fail() { echo "ERROR: $*" >&2; exit 1; }

# --- preflight -------------------------------------------------------------------
[ -f "$RILEY/enterprise/backend/src/metabase_enterprise/semantic_search/sqlite.clj" ] || fail "no sqlite store in $RILEY"
[ "$STORE" = pgvector ] || [ -f "$RILEY/resources/vec1/darwin-aarch64/vec1.dylib" ] || fail "vec1.dylib missing (copy Libor's, see DEMO.md)"
[ -f "$RILEY/resources/frontend_client/index.html" ] || fail "frontend not built in $RILEY (bun run build, see DEMO.md)"
curl -sf http://localhost:11434/api/version >/dev/null || fail "ollama is not listening on 11434"

if [ -z "${MB_PREMIUM_EMBEDDING_TOKEN:-}" ]; then
  TOKEN_FILE="$HARNESS_REPO/local/.mb-license-token"
  [ -s "$TOKEN_FILE" ] || fail "no license token: export MB_PREMIUM_EMBEDDING_TOKEN or fill $TOKEN_FILE"
  MB_PREMIUM_EMBEDDING_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export MB_PREMIUM_EMBEDDING_TOKEN
fi

# --- admin user (headless setup; works on an already set-up app DB too) -----------
if [ ! -s "$DIR/.admin-password" ]; then
  (umask 077; python3 -c 'import secrets;print(secrets.token_urlsafe(12))' > "$DIR/.admin-password")
fi
ADMIN_EMAIL="demo-admin@example.com"
(umask 077; cat > "$DIR/config.yml" <<EOF
version: 1
config:
  users:
    - first_name: Demo
      last_name: Admin
      email: $ADMIN_EMAIL
      password: $(cat "$DIR/.admin-password")
      is_superuser: true
EOF
)

# --- common env --------------------------------------------------------------------
export MB_EDITION=ee
export MB_CONFIG_FILE_PATH="$DIR/config.yml"
export MB_PLUGINS_DIR="$DIR/plugins"
export MB_SEARCH_ENGINE=semantic
export MB_EE_EMBEDDING_PROVIDER=ollama
export MB_EE_EMBEDDING_MODEL="${DEMO_EMBED_MODEL:-all-minilm}"
export MB_EE_EMBEDDING_MODEL_DIMENSIONS="${DEMO_EMBED_DIMS:-384}"
export MB_ANON_TRACKING_ENABLED=false MB_CHECK_FOR_UPDATES=false MB_SEND_NEW_SSO_USER_ADMIN_EMAIL=false
export MB_LOAD_SAMPLE_CONTENT=false
unset MB_PGVECTOR_DB_URL MB_DB_CONNECTION_URI MB_SEMANTIC_SEARCH_SQLITE_PATH
if [ "$STORE" = sqlite ]; then
  export MB_SEMANTIC_SEARCH_SQLITE_PATH="$DIR/semantic.sqlite"
  export MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE=0.7
else
  VECDB="mb_demo_${WHICH}_vec"
  docker exec semantic_search-postgres-1 psql -U postgres -tAc "select 1 from pg_database where datname='$VECDB'" | grep -q 1 \
    || docker exec semantic_search-postgres-1 psql -U postgres -qc "CREATE DATABASE $VECDB" >/dev/null
  docker exec semantic_search-postgres-1 psql -U postgres -d "$VECDB" -qc "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
  export MB_PGVECTOR_DB_URL="jdbc:postgresql://localhost:55432/$VECDB?user=postgres&password=postgres"
  export MB_SEMANTIC_SEARCH_VECTOR_STRATEGY=brute-force
fi

case "$WHICH" in
  northwind)
    export MB_JETTY_PORT="${DEMO_PORT:-3050}"
    export MB_DB_TYPE=h2 MB_DB_FILE="$DIR/app.db"
    ;;
  stats)
    export MB_JETTY_PORT="${DEMO_PORT:-3051}"
    unset MB_DB_FILE
    export MB_DB_TYPE=postgres MB_DB_HOST=localhost MB_DB_PORT=55432 MB_DB_DBNAME=mb_stats_demo \
           MB_DB_USER=postgres MB_DB_PASS=postgres
    MANIFEST="$HARNESS_REPO/local/stats-real/manifest.json"
    MB_ENCRYPTION_SECRET_KEY="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['appdb_encryption_key'])" "$MANIFEST")"
    export MB_ENCRYPTION_SECRET_KEY
    # Outbound guards must already be applied to mb_stats_demo (guards.sql, see DEMO.md).
    GUARDS=$(docker exec semantic_search-postgres-1 psql -U postgres -d mb_stats_demo -tAc \
      "select (select count(*) filter (where active) from notification)
            + (select count(*) filter (where is_full_sync or is_on_demand
                                          or metadata_sync_schedule not like '% 2099'
                                          or cache_field_values_schedule not like '% 2099')
                 from metabase_database where not is_audit)" 2>/dev/null) \
      || fail "mb_stats_demo is not reachable (restore it first, see DEMO.md)"
    [ "$GUARDS" = "0" ] || fail "mb_stats_demo outbound guards not applied ($GUARDS left): run guards.sql (DEMO.md)"
    ;;
  *) fail "unknown instance '$WHICH' (northwind|stats)" ;;
esac

lsof -nP -iTCP:"$MB_JETTY_PORT" -sTCP:LISTEN >/dev/null 2>&1 && fail "port $MB_JETTY_PORT is busy"

echo "demo instance '$WHICH': http://localhost:$MB_JETTY_PORT  store $STORE ${MB_SEMANTIC_SEARCH_SQLITE_PATH:-${VECDB:-}}  embedder $MB_EE_EMBEDDING_MODEL"
echo "login $ADMIN_EMAIL / password in $DIR/.admin-password"

# --- boot, retrying the license token check -------------------------------------------
cd "$RILEY"
LOG="$DIR/metabase.log"
PID=""
trap '[ -n "$PID" ] && kill "$PID" 2>/dev/null; exit 130' INT TERM
for attempt in 1 2 3; do
  offset=$( [ -f "$LOG" ] && wc -c < "$LOG" | tr -d ' ' || echo 0 )
  clojure -M:run:drivers:ee >> "$LOG" 2>&1 &
  PID=$!
  echo "boot attempt $attempt (pid $PID), tail -f $LOG"
  token_failed=""
  while kill -0 "$PID" 2>/dev/null; do
    if curl -sf "http://localhost:$MB_JETTY_PORT/api/health" | grep -q '"ok"'; then
      echo "READY: http://localhost:$MB_JETTY_PORT"
      rc=0; wait "$PID" || rc=$?; exit "$rc"
    fi
    new=$(tail -c +"$((offset + 1))" "$LOG")
    if grep -q "premium-features.token-check :: Error checking token" <<<"$new" && grep -q "Initialization FAILED" <<<"$new"; then
      token_failed=1; kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true; break
    fi
    sleep 5
  done
  if [ -z "$token_failed" ]; then rc=0; wait "$PID" || rc=$?; fail "Metabase exited during boot (exit $rc), see $LOG"; fi
  [ "$attempt" = 3 ] && fail "license token check failed 3 times"
  echo "boot attempt $attempt failed on the license token check (network); retrying in 60 s from a clean store"
  rm -f "$DIR"/semantic.sqlite "$DIR"/semantic.sqlite-wal "$DIR"/semantic.sqlite-shm
  [ "$WHICH" = northwind ] && rm -f "$DIR"/app.db.mv.db "$DIR"/app.db.trace.db
  if [ "$STORE" = pgvector ]; then
    docker exec semantic_search-postgres-1 psql -U postgres -qc "DROP DATABASE IF EXISTS $VECDB WITH (FORCE)" -c "CREATE DATABASE $VECDB" >/dev/null
    docker exec semantic_search-postgres-1 psql -U postgres -d "$VECDB" -qc "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
  fi
  sleep 60
done
