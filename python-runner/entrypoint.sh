#!/bin/bash
set -e

# Check if script file exists
if [ ! -f "$SCRIPT_FILE" ]; then
    echo "Error: Script file not found at $SCRIPT_FILE" >&2
    exit 1
fi

# Create output directory if needed and ensure we can write to it
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
mkdir -p "$OUTPUT_DIR" 2>/dev/null || true

# Execute the Python script with timeout (default 30 seconds)
TIMEOUT=${TIMEOUT:-30}
timeout --preserve-status $TIMEOUT python "$SCRIPT_FILE"

# Check exit status
EXIT_CODE=$?
if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 143 ]; then
    echo "Error: Script execution timed out after $TIMEOUT seconds" >&2
    exit 124
fi

exit $EXIT_CODE