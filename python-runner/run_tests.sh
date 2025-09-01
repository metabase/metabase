#!/bin/bash
set -e

SERVER_URL="http://localhost:5001"
# Use same mount path as Makefile for consistency
TEST_DIR="/tmp/python-exec-work"

echo "Python Execution Server Test Runner"
echo "===================================="

# Create test directory on host
echo "📁 Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"

echo "🚀 Starting Python execution server with docker compose..."

# Stop any existing services
docker compose down 2>/dev/null || true

# Start services with environment variables
PYTHON_RUNNER_PORT=5001 PYTHON_RUNNER_MOUNT_PATH="$TEST_DIR" docker compose up -d

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if curl -s "$SERVER_URL/status" > /dev/null 2>&1; then
        echo "✅ Server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Server failed to start within 30 seconds"
        docker compose logs python-runner
        exit 1
    fi
    sleep 1
done

# Run the tests
echo "🧪 Running test suite..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
source "$SCRIPT_DIR/venv/bin/activate"
TEST_DIR="$TEST_DIR" python "$SCRIPT_DIR/tests/test_server.py" "$SERVER_URL"

echo ""
echo "🏁 Test run complete!"

# Cleanup
echo "🧹 Cleaning up..."
rm -rf "$TEST_DIR"
