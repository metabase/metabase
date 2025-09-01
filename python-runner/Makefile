.PHONY: build run stop test clean rebuild logs status help

# Configuration
PORT = 5001
MOUNT_PATH = /tmp/python-exec-work

# Default target
build:
	docker compose build python-runner

# Run the server
run: build stop
	@mkdir -p $(MOUNT_PATH)
	PYTHON_RUNNER_PORT=$(PORT) PYTHON_RUNNER_MOUNT_PATH=$(MOUNT_PATH) docker compose up -d
	@echo "Server starting on http://localhost:$(PORT)"
	@echo "Mount path: $(MOUNT_PATH)"
	@echo "Network: Container can reach host at host.docker.internal"
	@echo "Waiting for server to be ready..."
	@sleep 2
	@curl -s http://localhost:$(PORT)/status > /dev/null && \
		echo "✅ Server is ready!" && \
		echo "" && \
		echo "For Metabase integration, configure:" && \
		echo "  python-execution-server-url: http://localhost:$(PORT)" && \
		echo "  python-execution-mount-path: $(MOUNT_PATH)" && \
		echo "  python-runner-base-url: http://host.docker.internal:3000" || \
		echo "⚠️ Server may still be starting..."

# Stop and remove the container
stop:
	@docker compose down

# Run the test suite
test: build
	./run_tests.sh

# Quick smoke test without full test suite
smoke-test: run
	@echo "Running smoke test..."
	@mkdir -p /tmp/python-exec-tests/smoke
	@curl -s -X POST http://localhost:$(PORT)/execute \
		-H "Content-Type: application/json" \
		-d '{"code":"import pandas as pd\ndef transform():\n    return pd.DataFrame({\"test\":[\"OK\"]})", "working_dir":"/tmp/python-exec-tests/smoke", "timeout":5}' \
		| jq -r '.exit_code' | grep -q "^0$$" && echo "✅ Smoke test passed!" || echo "❌ Smoke test failed!"

# View server logs
logs:
	docker compose logs -f python-runner

# Check server status
status:
	@curl -s http://localhost:$(PORT)/status | jq . || echo "Server not running"

# Remove the Docker image
clean: stop
	docker compose down --rmi all --volumes 2>/dev/null || true
	rm -rf venv 2>/dev/null || true
	rm -rf $(MOUNT_PATH) 2>/dev/null || true

# Rebuild from scratch (no cache)
rebuild: clean
	docker compose build --no-cache python-runner

# Setup development environment
dev-setup:
	python3 -m venv venv
	./venv/bin/pip install requests

# Run all services (python-runner + localstack)
run-all: build
	@mkdir -p $(MOUNT_PATH)
	PYTHON_RUNNER_PORT=$(PORT) PYTHON_RUNNER_MOUNT_PATH=$(MOUNT_PATH) docker compose up -d
	@echo "All services starting..."
	@echo "Python runner: http://localhost:$(PORT)"
	@echo "LocalStack: http://localhost:4566"
	@echo "Mount path: $(MOUNT_PATH)"

# Stop all services
stop-all:
	@docker compose down

# Show help
help:
	@echo "Available targets:"
	@echo "  build      - Build the python-runner image"
	@echo "  run        - Run the python-runner container only"
	@echo "  run-all    - Run all services (python-runner + localstack)"
	@echo "  stop       - Stop and remove the python-runner container"
	@echo "  stop-all   - Stop all services"
	@echo "  test       - Run the full test suite"
	@echo "  smoke-test - Quick test to verify server works"
	@echo "  logs       - View python-runner logs"
	@echo "  status     - Check server status and metrics"
	@echo "  clean      - Remove container, image, and temp files"
	@echo "  rebuild    - Clean and rebuild without cache"
	@echo "  dev-setup  - Setup Python virtual environment"
	@echo "  help       - Show this help message"
