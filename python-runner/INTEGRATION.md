# Python Execution Server - Transform Runner Integration

## Overview

The Python execution server uses the `transform_runner.py` framework, which provides a standardized way for users to write data transformation functions that integrate with Metabase.

## Server Features (`server.py`)
- Uses `transform_runner.py` for executing user code
- Memory limit of 1GB to support pandas/numpy operations
- Supports table data passed as file paths via table_mapping parameter
- Returns CSV output file path when transform succeeds

### Transform Runner Framework
- Users write a `transform()` function that returns a pandas DataFrame
- The framework handles:
  - CSV output generation
  - Error handling and logging
  - Metabase API integration for reading tables
  - Parameter injection for table data

### API Specification

The `/execute` endpoint accepts the following parameters:
```json
{
  "code": "Python code with transform() function",
  "working_dir": "/path/to/work/dir",
  "timeout": 30,
  "table_mapping": {                       // Optional
    "orders": /path/to/orders.jsonl
    "customers": /path/to/customers.jsonl
  }
}
```

Response includes the output CSV path:
```json
{
  "exit_code": 0,
  "execution_time": 1.23,
  "stdout_file": "/path/stdout.log",
  "stderr_file": "/path/stderr.log",
  "output_file": "/path/output.csv",  // Added
  "request_id": "uuid",
  "timeout": false
}
```

## Writing Transform Functions

### Basic Transform
```python
import pandas as pd

def transform():
    df = pd.DataFrame({
        "column1": [1, 2, 3],
        "column2": ["a", "b", "c"]
    })
    return df
```

### Transform with Table Parameters
```python
import pandas as pd

def transform(orders, customers):
    """Receives DataFrames from Metabase tables."""
    merged = pd.merge(orders, customers, on="customer_id")
    return merged
```

## Testing

All test fixtures have been updated to use the transform() function pattern:
- `basic_hello.py` - Basic transform test
- `error_test.py` - Error handling
- `timeout_test.py` - Timeout handling
- `pandas_test.py` - Pandas operations
- `table_params_test.py` - Table parameter handling

Run tests with:
```bash
./run_tests.sh
```

## Resource Limits

- Memory: 1024MB (increased for pandas/numpy)
- CPU Time: 60 seconds
- File Descriptors: 256
- Processes/Threads: 50

## Benefits

1. **Standardized Interface**: All Python transforms follow the same pattern
2. **Metabase Integration**: Built-in support for reading Metabase tables
3. **Automatic CSV Generation**: Transform results automatically saved as CSV
4. **Error Handling**: Consistent error reporting and logging
5. **Resource Management**: Proper limits prevent runaway processes
