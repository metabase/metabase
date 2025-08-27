#!/bin/bash
set -e

SERVER_URL="http://localhost:5001"
CONTAINER_NAME="python-exec-test"
DOCKER_IMAGE="python-exec-server"
# Use same mount path as Makefile for consistency
TEST_DIR="/tmp/python-exec-work"

echo "Python Execution Server Test Runner"
echo "===================================="

# Create test directory on host
echo "📁 Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"

# Check if server is already running
if curl -s "$SERVER_URL/status" > /dev/null 2>&1; then
    echo "⚠️  Stopping existing server..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

echo "🚀 Starting Python execution server with mounted test directory..."

# Stop and remove existing container if it exists
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Start new container with mounted volume
docker run -d -p 5001:5000 --name "$CONTAINER_NAME" \
    -v "$TEST_DIR:$TEST_DIR" \
    "$DOCKER_IMAGE"
    
# Wait for server to be ready
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if curl -s "$SERVER_URL/status" > /dev/null 2>&1; then
        echo "✅ Server is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Server failed to start within 30 seconds"
        docker logs "$CONTAINER_NAME"
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