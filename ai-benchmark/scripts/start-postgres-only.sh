#!/bin/bash
set -euo pipefail

# Start a Postgres-only instance with preloaded data from a benchmark suite
#
# This script starts a containerized Postgres instance with data loaded,
# but does NOT start Metabase. Useful for fast iteration during dump development.
#
# Usage:
#   ./start-postgres-only.sh <suite_name> [options]
#
# Example:
#   # Start Postgres with canonical_benchmark data (interactive - stops on Ctrl+C)
#   ./start-postgres-only.sh canonical_benchmark
#
#   # Start and keep running in background
#   ./start-postgres-only.sh canonical_benchmark --keep-running
#
#   # Then iterate on dumps:
#   ./scripts/load-dump.sh my_test_dump.sql
#   ./scripts/load-dump.sh my_test_dump_v2.sql
#
#   # When ready for Metabase, stop and use start-metabase.sh:
#   docker stop metabase-bench-canonical_benchmark
#   ./scripts/start-metabase.sh canonical_benchmark

SUITE_NAME="${1:-}"
KEEP_RUNNING="${2:-}"

if [ -z "${SUITE_NAME}" ]; then
    echo "Error: Suite name not specified"
    echo "Usage: $0 <suite_name> [--keep-running]"
    echo ""
    echo "Available benchmark suites:"
    find "$(dirname "$0")/../src/benchmarks" -maxdepth 1 -type d -not -name benchmarks -exec basename {} \;
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_DIR="${SCRIPT_DIR}/../src/benchmarks/${SUITE_NAME}"
DUMP_FILE="${SCRIPT_DIR}/../src/benchmarks/fixtures/db_dump.sql"

if [ ! -d "${SUITE_DIR}" ]; then
    echo "Error: Suite '${SUITE_NAME}' not found at ${SUITE_DIR}"
    exit 1
fi

if [ ! -f "${DUMP_FILE}" ]; then
    echo "Error: Dump file not found at ${DUMP_FILE}"
    exit 1
fi

CONTAINER_NAME="${CONTAINER_NAME:-metabase-bench-${SUITE_NAME}}"
IMAGE_NAME="metabase-benchmark-base:latest"

# Port configuration with defaults
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

echo "======================================"
echo "Starting Postgres-only with ${SUITE_NAME} data"
echo "======================================"
echo ""

# Check if image exists
if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}$"; then
    echo "Error: Base image not found: ${IMAGE_NAME}"
    echo "Please build it first:"
    echo "  ./scripts/build-base-image.sh"
    exit 1
fi

# Stop and remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

# Start container with dump file mounted, but override CMD to only run Postgres
echo "Starting container '${CONTAINER_NAME}'..."
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${POSTGRES_PORT}:5432" \
    -v "${DUMP_FILE}:/docker-entrypoint-initdb.d/dump.sql:ro" \
    "${IMAGE_NAME}" \
    /bin/bash -c "su - postgres -c '/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql/startup.log start' && \
    sleep 3 && \
    if [ -f /docker-entrypoint-initdb.d/dump.sql ]; then \
        echo 'Loading SQL dump...' && \
        su - postgres -c 'psql -U postgres -f /docker-entrypoint-initdb.d/dump.sql' && \
        echo 'Dump loaded successfully!'; \
    fi && \
    tail -f /dev/null"

echo ""
echo "Container is starting and loading data dump..."
echo "This may take a minute..."

# Wait for Postgres to be ready (it will load dump during startup)
sleep 5
for i in {1..60}; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null 2>&1; then
        echo "Postgres is ready and data loaded!"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "Error: Postgres failed to start"
        docker logs "${CONTAINER_NAME}"
        exit 1
    fi
    sleep 2
done

echo ""
echo "======================================"
echo "✓ Postgres Instance Ready!"
echo "======================================"
echo ""
echo "Container: ${CONTAINER_NAME}"
echo "Postgres: localhost:${POSTGRES_PORT} (user: postgres, password: postgres)"
echo ""
echo "Metabase is NOT running (Postgres-only mode)."
echo ""
echo "You can now:"
echo "  - Iterate on dumps: ./scripts/load-dump.sh my_dump.sql"
echo "  - Export dumps: ./scripts/export-dump.sh my_export.sql"
echo ""
echo "When ready for Metabase:"
echo "  docker stop ${CONTAINER_NAME}"
echo "  ./scripts/start-metabase.sh ${SUITE_NAME}"
echo ""

if [ "${KEEP_RUNNING}" == "--keep-running" ]; then
    echo "Container will keep running. To stop:"
    echo "  docker stop ${CONTAINER_NAME}"
    echo ""
else
    echo "Press Ctrl+C to stop the container and clean up..."
    echo ""

    # Wait for user interrupt
    trap "echo ''; echo 'Stopping container...'; docker stop ${CONTAINER_NAME} >/dev/null 2>&1; docker rm ${CONTAINER_NAME} >/dev/null 2>&1; echo 'Done!'; exit 0" INT TERM

    # Keep script running
    while true; do
        sleep 1
    done
fi
