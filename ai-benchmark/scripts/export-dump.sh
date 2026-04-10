#!/bin/bash
set -euo pipefail

# Export a SQL dump from a running Docker container
#
# This script:
# - Auto-detects running metabase-bench-* container
# - Stops Metabase (to ensure clean export)
# - Exports using pg_dumpall inside the container (avoids version mismatch)
# - Restarts Metabase
#
# Usage:
#   ./export-dump.sh <output_file> [container_name]
#
# Examples:
#   # Auto-detect container
#   ./export-dump.sh src/benchmarks/fixtures/db_dump.sql
#
#   # Specify container explicitly
#   ./export-dump.sh src/benchmarks/fixtures/db_dump.sql metabase-bench-canonical_benchmark

OUTPUT_FILE="${1:-}"
CONTAINER_NAME="${2:-}"

if [ -z "${OUTPUT_FILE}" ]; then
    echo "Error: Output file not specified"
    echo "Usage: $0 <output_file> [container_name]"
    exit 1
fi

echo "======================================"
echo "Exporting SQL Dump from Container"
echo "======================================"
echo "Output file: ${OUTPUT_FILE}"

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
    # Stop Metabase to ensure clean export
    echo "Stopping Metabase..."
    docker exec "${CONTAINER_NAME}" supervisorctl stop metabase
    sleep 2
else
    echo "Postgres-only mode detected (no Metabase to stop)."
fi

# Export using pg_dumpall for globals + pg_dump per database
echo "Exporting full cluster (all databases, users, roles)..."

# Step 1: Export global objects (roles, users, tablespaces)
echo "  - Exporting global objects (roles, users)..."
docker exec "${CONTAINER_NAME}" pg_dumpall -U postgres --globals-only --clean --if-exists > "${OUTPUT_FILE}"

# Step 2: Get list of databases (excluding templates and postgres system DB)
echo "  - Discovering databases..."
DATABASES=$(docker exec "${CONTAINER_NAME}" psql -U postgres -t -A -c \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'" | tr -d ' ')

if [ -z "${DATABASES}" ]; then
    echo "Error: No databases found to export"
    exit 1
fi

echo "  - Found databases: $(echo ${DATABASES} | tr '\n' ', ' | sed 's/,$//')"

# Step 3: Export each database
for db in ${DATABASES}; do
  echo "  - Exporting database: ${db}"
  if [ "$db" = "metabase" ]; then
    # Exclude metabot conversation data from metabase DB (keep schema, exclude data)
    docker exec "${CONTAINER_NAME}" pg_dump -U postgres \
      --create --clean --if-exists \
      --exclude-table-data=public.metabot_conversation \
      --exclude-table-data=public.metabot_message \
      "${db}" >> "${OUTPUT_FILE}"
  else
    # Export other databases completely
    docker exec "${CONTAINER_NAME}" pg_dump -U postgres \
      --create --clean --if-exists \
      "${db}" >> "${OUTPUT_FILE}"
  fi
done

echo "  - Export complete"

if [ "$SUPERVISORD_RUNNING" = true ]; then
    # Restart Metabase
    echo ""
    echo "Restarting Metabase..."
    docker exec "${CONTAINER_NAME}" supervisorctl start metabase
    echo "Metabase is starting (may take 30-60 seconds to be fully ready)..."
fi

echo ""
echo "======================================"
echo "✓ Dump Exported Successfully!"
echo "======================================"
echo "Saved to: ${OUTPUT_FILE}"
echo "Size: $(du -h "${OUTPUT_FILE}" | cut -f1)"
echo ""
echo "This dump can be:"
echo "  - Committed to the repo for others to use"
echo "  - Loaded back with: ./scripts/load-dump.sh ${OUTPUT_FILE}"
