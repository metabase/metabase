# Python Execution Server Tests

## Structure

- `fixtures/` - Python test scripts used as test inputs
  - `basic_hello.py` - Basic execution test
  - `error_test.py` - Error handling test  
  - `timeout_test.py` - Timeout handling test
  - `long_task.py` - Long-running task for concurrency testing
  - `quick_task.py` - Quick task for queue testing
  - `json_test.py` - JSON processing test
  - `pandas_test.py` - Pandas integration test

- `test_server.py` - Main test suite with comprehensive tests

## Running Tests

```bash
# From python-runner directory:
./run_tests.sh
```

The test runner will:
1. Create a shared test directory at `/tmp/python-exec-tests`
2. Start the Docker container with the test directory mounted
3. Run all tests using the Python virtual environment
4. Clean up test files

## Test Coverage

- ✅ Server health check
- ✅ Basic code execution
- ✅ Error handling with proper exit codes
- ✅ Timeout enforcement
- ✅ Concurrent request queuing
- ✅ JSON processing
- ✅ Metrics tracking
- ✅ File I/O in mounted directories

## Requirements

- Docker
- Python 3 with venv
- `requests` library (installed in venv)