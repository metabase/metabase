#!/bin/bash
set -euo pipefail

# Export database schema only (no data) to stdout
#
# This script:
# - Auto-detects running metabase-bench-* container
# - Exports schema-only dump of specified database using pg_dump
# - Outputs to stdout (can be redirected to a file)
#
# Usage:
#   ./export-dump-schema-only.sh [dbname] [container_name]
#   ./export-dump-schema-only.sh [dbname] [container_name] > schema.sql
#
# Arguments:
#   dbname          Database name (default: "analytics")
#   container_name  Docker container name (default: auto-detect)
#
# Examples:
#   # Auto-detect container, use default database (analytics)
#   ./export-dump-schema-only.sh
#
#   # Specify database name
#   ./export-dump-schema-only.sh mydb
#
#   # Specify database and save to file
#   ./export-dump-schema-only.sh analytics > analytics-schema.sql
#
#   # Specify both database and container
#   ./export-dump-schema-only.sh analytics metabase-bench-canonical_benchmark > analytics-schema.sql

DBNAME="${1:-analytics}"
CONTAINER_NAME="${2:-}"

# Try to find a running container if not specified
if [ -z "${CONTAINER_NAME}" ]; then
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep '^metabase-bench-' | head -n 1 || true)
fi

if [ -z "${CONTAINER_NAME}" ] || ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: No running metabase-bench-* container found" >&2
    echo "" >&2
    echo "Please start a container first:" >&2
    echo "  ./scripts/start-metabase.sh canonical_benchmark" >&2
    exit 1
fi

# Log to stderr so it doesn't interfere with stdout dump
echo "=====================================" >&2
echo "Exporting Database Schema (No Data)" >&2
echo "=====================================" >&2
echo "Container: ${CONTAINER_NAME}" >&2
echo "Database: ${DBNAME}" >&2
echo "" >&2

# Check if database exists
DB_EXISTS=$(docker exec "${CONTAINER_NAME}" psql -U postgres -t -A -c \
  "SELECT 1 FROM pg_database WHERE datname = '${DBNAME}'" || echo "")

if [ -z "${DB_EXISTS}" ]; then
    echo "Error: database '${DBNAME}' does not exist in container ${CONTAINER_NAME}" >&2
    exit 1
fi

echo "Exporting schema only (no data)..." >&2

# Export schema only using pg_dump with --schema-only flag
# --schema-only: dump only the object definitions (schema), not data
# --no-owner: do not output commands to set ownership of objects
# --no-privileges: do not output commands to set access privileges
docker exec "${CONTAINER_NAME}" pg_dump -U postgres \
  --schema-only \
  --no-owner \
  --no-privileges \
  "${DBNAME}"

echo "" >&2
echo "=====================================" >&2
echo "✓ Schema Export Complete!" >&2
echo "=====================================" >&2
