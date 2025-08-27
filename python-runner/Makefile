.PHONY: build run test clean help

# Default target
build:
	docker build -t python-sandbox .

# Run a test script to verify the sandbox works
test: build
	@echo "Testing Python sandbox with simple script..."
	@echo "import pandas as pd; print('Sandbox working!')" > /tmp/test_sandbox.py
	@docker run --rm -v /tmp/test_sandbox.py:/sandbox/script.py:ro python-sandbox python /sandbox/script.py
	@rm -f /tmp/test_sandbox.py

# Remove the Docker image
clean:
	docker rmi python-sandbox 2>/dev/null || true

# Rebuild from scratch (no cache)
rebuild: clean
	docker build --no-cache -t python-sandbox .

# Show help
help:
	@echo "Available targets:"
	@echo "  build    - Build the Python sandbox Docker image (default)"
	@echo "  test     - Run a simple test to verify the sandbox works"
	@echo "  clean    - Remove the Docker image"
	@echo "  rebuild  - Clean and rebuild without cache"
	@echo "  help     - Show this help message"