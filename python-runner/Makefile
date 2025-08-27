.PHONY: build run stop test clean rebuild logs status help

# Docker image and container names
IMAGE_NAME = python-exec-server
CONTAINER_NAME = python-exec-test
PORT = 5001

# Mount path for shared directory
MOUNT_PATH = /tmp/python-exec-work

# Default target
build:
	docker build -t $(IMAGE_NAME) .

# Run the server
run: build stop
	@mkdir -p $(MOUNT_PATH)
	docker run -d -p $(PORT):5000 --name $(CONTAINER_NAME) \
		-v $(MOUNT_PATH):$(MOUNT_PATH) \
		--add-host host.docker.internal:host-gateway \
		$(IMAGE_NAME)
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
	@docker stop $(CONTAINER_NAME) 2>/dev/null || true
	@docker rm $(CONTAINER_NAME) 2>/dev/null || true

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
	docker logs -f $(CONTAINER_NAME)

# Check server status
status:
	@curl -s http://localhost:$(PORT)/status | jq . || echo "Server not running"

# Remove the Docker image
clean: stop
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
	rm -rf venv 2>/dev/null || true
	rm -rf $(MOUNT_PATH) 2>/dev/null || true

# Rebuild from scratch (no cache)
rebuild: clean
	docker build --no-cache -t $(IMAGE_NAME) .

# Setup development environment
dev-setup:
	python3 -m venv venv
	./venv/bin/pip install requests

# Show help
help:
	@echo "Available targets:"
	@echo "  build      - Build the Docker image"
	@echo "  run        - Run the server container"
	@echo "  stop       - Stop and remove the container"
	@echo "  test       - Run the full test suite"
	@echo "  smoke-test - Quick test to verify server works"
	@echo "  logs       - View server logs"
	@echo "  status     - Check server status and metrics"
	@echo "  clean      - Remove container, image, and temp files"
	@echo "  rebuild    - Clean and rebuild without cache"
	@echo "  dev-setup  - Setup Python virtual environment"
	@echo "  help       - Show this help message"