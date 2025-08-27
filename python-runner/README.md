# Python Execution Server

A containerized Python execution service for Metabase that safely runs user-defined data transformation functions.

## Architecture

The server uses a transform-based architecture where users write a `transform()` function that:
- Receives table data as parameters (when connected to Metabase)
- Processes the data using pandas
- Returns a DataFrame that's automatically saved as CSV

## Directory Structure

```
python-runner/
├── server.py            # Flask web server with execution queue
├── transform_runner.py  # Transform framework that wraps user code
├── client.py           # Python client library for the API
├── Dockerfile          # Container definition
├── Makefile           # Development and deployment commands
├── run_tests.sh       # Test suite runner
├── tests/             # Test suite and fixtures
│   ├── test_server.py # Comprehensive test suite
│   ├── fixtures/      # Test transform functions
│   └── README.md      # Test documentation
├── INTEGRATION.md     # Integration details
└── venv/             # Python virtual environment (git-ignored)
```

## Quick Start

```bash
# Build and run the server
make run

# Check server status
make status

# Run tests
make test

# View logs
make logs

# Stop server
make stop
```

## API Usage

### Execute Transform

```bash
curl -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import pandas as pd\ndef transform():\n    return pd.DataFrame({\"result\": [1, 2, 3]})",
    "working_dir": "/tmp/work",
    "timeout": 30
  }'
```

### Check Status

```bash
curl http://localhost:5001/status
```

## Writing Transforms

User code must define a `transform()` function:

```python
import pandas as pd

def transform():
    # Process data
    df = pd.DataFrame({
        "column1": [1, 2, 3],
        "column2": ["a", "b", "c"]
    })
    
    # Return DataFrame (will be saved as CSV)
    return df
```

With Metabase table parameters:

```python
def transform(orders, customers):
    # Receive DataFrames from Metabase
    merged = pd.merge(orders, customers, on="customer_id")
    return merged
```

## Features

- **Sequential Processing**: Single-worker queue ensures no concurrent execution
- **Resource Limits**: Memory (1GB), CPU (60s), processes (50)
- **Error Handling**: Proper error capture and timeout management
- **File Isolation**: Each execution gets its own working directory
- **Metrics Tracking**: Request counts, execution times, success rates
- **Transform Framework**: Standard interface for all Python transformations

## Development

```bash
# Setup development environment
make dev-setup

# Run smoke test
make smoke-test

# Rebuild without cache
make rebuild

# Clean everything
make clean
```

## Testing

The test suite includes 8 comprehensive tests:
- Server health check
- Basic transform execution
- Error handling
- Timeout enforcement
- JSON processing
- Transform with parameters
- Metrics tracking
- Concurrent request queuing

Run tests with: `make test`

## Security

- Runs as non-root user (pyexec)
- Resource limits enforced via setrlimit
- Process isolation with separate process groups
- Memory limited to 1GB
- CPU time limited to 60 seconds
- File descriptors limited to 256