#!/bin/bash

# Check if arguments are provided
if [ $# -ne 6 ]; then
    echo "Usage: $0 <code_file> <output_file> <stdout_file> <stderr_file> <metabase_url> <api_key>"
    exit 1
fi

CODE_FILE="$1"
OUTPUT_FILE="$2"
STDOUT_FILE="$3"
STDERR_FILE="$4"
METABASE_URL="$5"
API_KEY="$6"

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

# Pass through Metabase API configuration from environment
if [ -n "$METABASE_URL" ]; then
  DOCKER_NETWORK_ARGS+=(--network=host)

  # Transform localhost connections to host.docker.internal for cross-platform compatibility
  TRANSFORMED_METABASE_URL="${METABASE_URL//localhost/host.docker.internal}"
  TRANSFORMED_METABASE_URL="${TRANSFORMED_METABASE_URL//127.0.0.1/host.docker.internal}"

  DOCKER_ENV_VARS+=(-e "METABASE_URL=$TRANSFORMED_METABASE_URL")
fi

# Pass API key (required)
if [ -z "$API_KEY" ]; then
  echo "ERROR: API key is required but not provided"
  exit 1
fi
DOCKER_ENV_VARS+=(-e "X_API_KEY=$API_KEY")

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
