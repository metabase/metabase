#!/bin/bash

# Check if arguments are provided
if [ $# -ne 4 ] && [ $# -ne 5 ]; then
    echo "Usage: $0 <code_file> <output_file> <stdout_file> <stderr_file> [db_connection_string]"
    exit 1
fi

CODE_FILE="$1"
OUTPUT_FILE="$2"
STDOUT_FILE="$3"
STDERR_FILE="$4"
DB_CONNECTION_STRING="$5"

# Create output directory if it doesn't exist
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

# Create directories for stdout and stderr files if they don't exist
STDOUT_DIR="$(dirname "$STDOUT_FILE")"
STDERR_DIR="$(dirname "$STDERR_FILE")"
mkdir -p "$STDOUT_DIR"
mkdir -p "$STDERR_DIR"

# Get the directory containing this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build Docker environment variables
DOCKER_ENV_VARS=(
  -e "OUTPUT_FILE=/sandbox/output/$(basename "$OUTPUT_FILE")"
  -e "TIMEOUT=30"
)

# Build Docker networking options
DOCKER_NETWORK_ARGS=()
if [ -n "$DB_CONNECTION_STRING" ]; then
  # Database connection provided - allow network access
  # On macOS, use default bridge network with host.docker.internal
  # On Linux, this would ideally use --network host, but bridge works for testing
  DOCKER_NETWORK_ARGS+=(--add-host=host.docker.internal:host-gateway)
  
  # Transform localhost connections to host.docker.internal for cross-platform compatibility
  TRANSFORMED_DB_CONNECTION_STRING="${DB_CONNECTION_STRING//localhost/host.docker.internal}"
  TRANSFORMED_DB_CONNECTION_STRING="${TRANSFORMED_DB_CONNECTION_STRING//127.0.0.1/host.docker.internal}"
  
  DOCKER_ENV_VARS+=(-e "DB_CONNECTION_STRING=$TRANSFORMED_DB_CONNECTION_STRING")
else
  # No database connection - use network isolation
  DOCKER_NETWORK_ARGS+=(--network none)
fi

# Run Python code in Docker sandboxed environment with transform runner
docker run --rm \
  --entrypoint="" \
  "${DOCKER_NETWORK_ARGS[@]}" \
  --read-only \
  --tmpfs /tmp:uid=1000,gid=1000 \
  -v "$CODE_FILE":/sandbox/script.py:ro \
  -v "$SCRIPT_DIR/transform_runner.py":/sandbox/transform_runner.py:ro \
  -v "$OUTPUT_DIR":/sandbox/output \
  "${DOCKER_ENV_VARS[@]}" \
  --security-opt=no-new-privileges:true \
  --memory=512m \
  --cpus=0.5 \
  python-sandbox \
  python /sandbox/transform_runner.py \
  > "$STDOUT_FILE" 2> "$STDERR_FILE"