#!/bin/bash

# Check if arguments are provided
if [ $# -ne 4 ]; then
    echo "Usage: $0 <code_file> <output_file> <stdout_file> <stderr_file>"
    exit 1
fi

CODE_FILE="$1"
OUTPUT_FILE="$2"
STDOUT_FILE="$3"
STDERR_FILE="$4"

# Create output directory if it doesn't exist
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

# Create directories for stdout and stderr files if they don't exist
STDOUT_DIR="$(dirname "$STDOUT_FILE")"
STDERR_DIR="$(dirname "$STDERR_FILE")"
mkdir -p "$STDOUT_DIR"
mkdir -p "$STDERR_DIR"

# Run Python code in Docker sandboxed environment
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:uid=1000,gid=1000 \
  -v "$CODE_FILE":/sandbox/script.py:ro \
  -v "$OUTPUT_DIR":/sandbox/output \
  -e OUTPUT_FILE="/sandbox/output/$(basename "$OUTPUT_FILE")" \
  -e TIMEOUT=30 \
  --security-opt=no-new-privileges:true \
  --memory=512m \
  --cpus=0.5 \
  python-sandbox \
  > "$STDOUT_FILE" 2> "$STDERR_FILE"