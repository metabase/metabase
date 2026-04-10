#!/bin/bash
set -euo pipefail

# Load a SQL dump into a running Docker container
#
# This script:
# - Auto-detects running metabase-bench-* container
# - Stops Metabase (to release database locks)
# - Loads dump using psql inside the container
# - Restarts Metabase
#
# Usage:
#   ./load-dump.sh <dump_file> [container_name]
#
# Examples:
#   # Auto-detect container
#   ./load-dump.sh src/benchmarks/fixtures/db_dump.sql
#
#   # Specify container explicitly
#   ./load-dump.sh src/benchmarks/fixtures/db_dump.sql metabase-bench-canonical_benchmark

DUMP_FILE="${1:-}"
CONTAINER_NAME="${2:-}"

if [ -z "${DUMP_FILE}" ]; then
    echo "Error: Dump file not specified"
    echo "Usage: $0 <dump_file> [container_name]"
    exit 1
fi

if [ ! -f "${DUMP_FILE}" ]; then
    echo "Error: Dump file not found: ${DUMP_FILE}"
    exit 1
fi

echo "======================================"
echo "Loading SQL Dump into Container"
echo "======================================"
echo "Dump file: ${DUMP_FILE}"

# Try to find a running container if not specified
if [ -z "${CONTAINER_NAME}" ]; then
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep '^metabase-bench-' | head -n 1 || true)
fi

if [ -z "${CONTAINER_NAME}" ] || ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: No running metabase-bench-* container found"
    echo ""
    echo "Please start a container first:"
    echo "  ./scripts/start-metabase.sh canonical_benchmark"
    exit 1
fi

echo "Container: ${CONTAINER_NAME}"
echo ""

# Check if supervisord is running (determines if Metabase needs to be stopped)
SUPERVISORD_RUNNING=false
if docker exec "${CONTAINER_NAME}" supervisorctl status >/dev/null 2>&1; then
    SUPERVISORD_RUNNING=true
fi

if [ "$SUPERVISORD_RUNNING" = true ]; then
    # Stop Metabase to release database locks
    echo "Stopping Metabase to release database locks..."
    docker exec "${CONTAINER_NAME}" supervisorctl stop metabase
    sleep 2
else
    echo "Postgres-only mode detected (no Metabase to stop)."
fi

# Load dump using psql inside container
echo "Loading dump..."
docker exec -i "${CONTAINER_NAME}" psql -U postgres < "${DUMP_FILE}"

if [ "$SUPERVISORD_RUNNING" = true ]; then
    # Restart Metabase
    echo ""
    echo "Restarting Metabase..."
    docker exec "${CONTAINER_NAME}" supervisorctl start metabase
    echo "Metabase is starting (may take 30-60 seconds to be fully ready)..."
fi

echo ""
echo "======================================"
echo "✓ Dump Loaded Successfully!"
echo "======================================"
echo ""
echo "The container now has the data from: ${DUMP_FILE}"
echo "Metabase will be ready shortly at: http://localhost:3000"
