#!/bin/bash
# One-shot setup for the local Iceberg dev stack.
# Usage: ./dev/iceberg/setup.sh

set -e
cd "$(dirname "$0")"

echo "Starting Garage + Trino + init..."
docker compose up -d

echo ""
echo "Waiting for garage-init to complete..."
docker wait pa-garage-init >/dev/null 2>&1 || true
INIT_EXIT=$(docker inspect pa-garage-init --format='{{.State.ExitCode}}' 2>/dev/null)
if [ "$INIT_EXIT" != "0" ]; then
  echo "garage-init failed (exit $INIT_EXIT). Logs:"
  docker logs pa-garage-init
  exit 1
fi
docker logs pa-garage-init

echo ""
echo "Waiting for Trino to be ready..."
for i in $(seq 1 60); do
  if docker exec pa-trino trino --execute "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Creating Iceberg schema in Trino..."
docker exec pa-trino trino --execute "CREATE SCHEMA IF NOT EXISTS iceberg.product_analytics"

echo ""
echo "==== All set! ===="
echo ""
echo "Configure Metabase (REPL):"
echo '  (metabase-enterprise.product-analytics.storage/product-analytics-storage-backend! :metabase-enterprise.product-analytics.storage/iceberg)'
echo '  (metabase-enterprise.product-analytics.storage.iceberg.settings/product-analytics-query-engine! :starburst)'
echo '  (metabase-enterprise.product-analytics.storage.iceberg.settings/product-analytics-starburst-host! "localhost")'
echo '  (metabase-enterprise.product-analytics.storage.iceberg.settings/product-analytics-starburst-port! 8080)'
echo '  (metabase-enterprise.product-analytics.storage.iceberg.settings/product-analytics-starburst-ssl! false)'
echo '  (metabase-enterprise.product-analytics.storage.iceberg.settings/product-analytics-starburst-user! "trino")'
echo ""
echo "Teardown: docker compose -f dev/iceberg/docker-compose.yml down -v"
