.PHONY: build run stop test clean rebuild logs status help check-aws-cli wait-for-localstack ensure-bucket

# Configuration
PORT = 5001
MOUNT_PATH = /tmp/python-exec-work
AWS_COMMON_PARAMS = AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1

# Check if AWS CLI is installed
check-aws-cli:
	@if ! command -v aws >/dev/null 2>&1; then \
		echo "❌ AWS CLI is not installed. Please install it first:"; \
		echo ""; \
		echo "  On macOS with Homebrew:"; \
		echo "    brew install awscli"; \
		echo ""; \
		echo "  On Ubuntu/Debian:"; \
		echo "    sudo apt-get install awscli"; \
		echo ""; \
		echo "  Or using pip:"; \
		echo "    pip install awscli"; \
		echo ""; \
		echo "  For other systems, see: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"; \
		exit 1; \
	fi
	@echo "✅ AWS CLI is installed (version: $$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2))"

# Wait for LocalStack to be ready
wait-for-localstack: check-aws-cli
	@echo "Waiting for LocalStack to be ready..."
	@for i in $$(seq 1 30); do \
		if $(AWS_COMMON_PARAMS) aws --endpoint-url=http://localhost:4566 s3 ls 2>/dev/null; then \
			echo "✅ LocalStack is ready!"; \
			exit 0; \
		fi; \
		echo "  Waiting for LocalStack... ($$i/30)"; \
		sleep 2; \
	done; \
	echo "❌ LocalStack failed to start after 60 seconds"; \
	exit 1

# Ensure S3 bucket exists
ensure-bucket: wait-for-localstack
	@echo "Checking S3 bucket..."
	@if $(AWS_COMMON_PARAMS) aws --endpoint-url=http://localhost:4566 s3 ls s3://metabase-python-runner 2>/dev/null; then \
		echo "  ✅ Bucket 'metabase-python-runner' already exists"; \
	else \
		echo "  Creating S3 bucket 'metabase-python-runner'..."; \
		$(AWS_COMMON_PARAMS) aws --endpoint-url=http://localhost:4566 s3 mb s3://metabase-python-runner && \
		echo "  ✅ Bucket created successfully"; \
	fi

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
	@$(MAKE) ensure-bucket
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
	./venv/bin/pip install requests boto3

# Run all services (python-runner + localstack)
run-all: build
	@mkdir -p $(MOUNT_PATH)
	PYTHON_RUNNER_PORT=$(PORT) PYTHON_RUNNER_MOUNT_PATH=$(MOUNT_PATH) docker compose up -d
	@echo "All services starting..."
	@echo "Python runner: http://localhost:$(PORT)"
	@echo "LocalStack: http://localhost:4566"
	@echo "Mount path: $(MOUNT_PATH)"
	@$(MAKE) ensure-bucket
	@echo "✅ All services are ready!"

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
