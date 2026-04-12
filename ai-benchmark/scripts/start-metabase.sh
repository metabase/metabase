#!/bin/bash
set -euo pipefail

# Start a Metabase instance with preloaded benchmark data
#
# This script starts a containerized Metabase + Postgres instance with
# the benchmark data dump. It does NOT run the benchmark tests -
# use the Python benchmark runner for that.
#
# Usage:
#   ./start-metabase.sh [options]
#
# Example:
#   # Start Metabase (interactive - stops on Ctrl+C)
#   ./start-metabase.sh
#
#   # Start and keep running in background
#   ./start-metabase.sh --keep-running
#
#   # Then run benchmarks against it:
#   python -m src.benchmarks.e2e

# Parse arguments
KEEP_RUNNING=false
SEARCH_ENGINE="semantic"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Start a Metabase + Postgres instance with benchmark data."
            echo ""
            echo "Options:"
            echo "  --search-engine=ENGINE  Set the search engine (default: semantic)"
            echo "                          Valid values: semantic, appdb"
            echo "  --keep-running       Run container in background (default: interactive)"
            echo "  -h, --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  # Start interactively (stops on Ctrl+C)"
            echo "  $0"
            echo ""
            echo "  # Start in background"
            echo "  $0 --keep-running"
            echo ""
            echo "  # Start with keyword search engine"
            echo "  $0 --search-engine=appdb"
            exit 0
            ;;
        --search-engine=*)
            SEARCH_ENGINE="${1#*=}"
            if [[ ! "$SEARCH_ENGINE" =~ ^(semantic|appdb)$ ]]; then
                echo "Error: Invalid search engine: $SEARCH_ENGINE"
                echo "Valid values: semantic, appdb"
                exit 1
            fi
            shift
            ;;
        --keep-running)
            KEEP_RUNNING=true
            shift
            ;;
        -*)
            echo "Error: Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            echo "Error: Unexpected argument: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP_FILE="${SCRIPT_DIR}/../src/benchmarks/fixtures/db_dump.sql"

if [ ! -f "${DUMP_FILE}" ]; then
    echo "Error: Dump file not found at ${DUMP_FILE}"
    exit 1
fi

CONTAINER_NAME="${CONTAINER_NAME:-metabase-benchmark}"
IMAGE_NAME="metabase-benchmark-base:latest"

# Port configuration with defaults
METABASE_PORT="${METABASE_PORT:-3000}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# LLM provider configuration
MB_EE_EMBEDDING_SERVICE_BASE_URL="${MB_EE_EMBEDDING_SERVICE_BASE_URL:-https://vllm.internal.staging.metabase.com}"
MB_EE_EMBEDDING_SERVICE_API_KEY="${MB_EE_EMBEDDING_SERVICE_API_KEY:-}"
MB_LLM_ANTHROPIC_API_KEY="${MB_LLM_ANTHROPIC_API_KEY:-}"

echo "======================================"
echo "Starting Metabase benchmark instance"
echo "======================================"
echo ""

# Check for required environment variables
MISSING_VARS=()

if [ -z "${MB_PREMIUM_EMBEDDING_TOKEN:-}" ]; then
    MISSING_VARS+=("MB_PREMIUM_EMBEDDING_TOKEN")
fi
if [ -z "${MB_LLM_ANTHROPIC_API_KEY:-}" ]; then
    MISSING_VARS+=("MB_LLM_ANTHROPIC_API_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "Warning: The following required environment variables are not set:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    if [ "${CI:-}" = "true" ]; then
        echo "Running in CI — aborting due to missing env vars"
        exit 1
    fi
    echo "Set them with:"
    echo "  export MB_PREMIUM_EMBEDDING_TOKEN=\"your-token\""
    echo "  export MB_LLM_ANTHROPIC_API_KEY=\"your-key\""
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

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

# Start container with dump file mounted
echo "Starting container '${CONTAINER_NAME}'..."
echo "Search engine: ${SEARCH_ENGINE}"
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${METABASE_PORT}:3000" \
    -p "${POSTGRES_PORT}:5432" \
    -v "${DUMP_FILE}:/docker-entrypoint-initdb.d/dump.sql:ro" \
    -e MB_PREMIUM_EMBEDDING_TOKEN="${MB_PREMIUM_EMBEDDING_TOKEN:-}" \
    -e MB_EE_EMBEDDING_SERVICE_BASE_URL="${MB_EE_EMBEDDING_SERVICE_BASE_URL}" \
    -e MB_EE_EMBEDDING_SERVICE_API_KEY="${MB_EE_EMBEDDING_SERVICE_API_KEY:-}" \
    -e MB_LLM_ANTHROPIC_API_KEY="${MB_LLM_ANTHROPIC_API_KEY:-}" \
    -e MB_SEARCH_ENGINE="${SEARCH_ENGINE}" \
    "${IMAGE_NAME}"

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
echo "Waiting for Metabase to be ready..."
for i in {1..60}; do
    if curl -sf "http://localhost:${METABASE_PORT}/api/health" >/dev/null 2>&1; then
        echo "Metabase is ready!"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "Warning: Metabase health check timeout (may still be initializing)"
        break
    fi
    sleep 2
done

echo ""
echo "======================================"
echo "Metabase Instance Ready"
echo "======================================"
echo ""
echo "Container: ${CONTAINER_NAME}"
echo "Metabase: http://localhost:${METABASE_PORT}"
echo "Postgres: localhost:${POSTGRES_PORT} (user: postgres, password: postgres)"
echo ""
echo "Default Metabase credentials:"
echo "  Admin: admin@example.com / benchmark123"
echo "  User:  user@example.com / benchmark123"
echo ""
echo "To run benchmarks against this instance:"
if [[ "${METABASE_PORT}" != "3000" ]]; then
    echo "  export BENCHMARK_METABASE_HOST=http://localhost:${METABASE_PORT}"
fi
echo "  python -m src.benchmarks.e2e"
echo ""

if [ "${KEEP_RUNNING}" = true ]; then
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
