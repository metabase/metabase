#!/usr/bin/env bash
# Start the shared Postgres app DB (persistent named volume) that both v62 and v63 use.
set -euo pipefail
. "$(dirname "$0")/config.sh"

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"

if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "Postgres container $PG_CONTAINER already exists; (re)starting it (volume $PG_VOLUME preserved)"
  docker start "$PG_CONTAINER"
else
  echo "== Starting Postgres ($PG_CONTAINER) on network $NET, volume $PG_VOLUME =="
  docker run -d --name "$PG_CONTAINER" --network "$NET" --network-alias "$PG_HOST" \
    -v "$PG_VOLUME:/var/lib/postgresql/data" \
    -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB="$PG_DB" \
    postgres:18
fi

echo "Waiting for pg_isready..."
until docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1; do sleep 1; done
echo "Postgres ready."
