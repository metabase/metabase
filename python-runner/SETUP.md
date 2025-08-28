# Python Runner Setup Guide

This guide walks through setting up the Python execution service for use with Metabase transforms.

## Prerequisites

- Docker installed and running
- Metabase instance running (typically on port 3000)
- Admin access to Metabase settings

## Step 1: Start the Python Execution Service

From the `python-runner` directory:

```bash
# Build and start the service
make run
```

This will:
- Build the Docker image
- Start the container on port 5001
- Create a mount directory at `/tmp/python-exec-work`
- Display the configuration values you'll need

## Step 2: Configure Metabase Settings

In Metabase, these settings need to be configured (they're internal settings, not visible in the UI):

### Required Settings

1. **python-execution-server-url**: URL where the Python service is running
   - Default: `http://localhost:5001`
   - Update if running on a different host/port

2. **python-execution-mount-path**: Shared directory path between Metabase and Python service
   - Default: `/tmp/python-exec-work`
   - Must be accessible by both Metabase and the Python container

## Step 3: Verify Setup

### Check Python Service Status

```bash
make status
```

This shows the service metrics and confirms it's running.

### Run a Quick Test

```bash
make smoke-test
```

This executes a simple transform to verify the service works.

## Using Python Transforms in Metabase

Once configured, you can:

1. Create a new transform in Metabase
2. Select "Python" as the transform type
3. Write your transform function:

```python
import pandas as pd

def transform(table1, table2):
    # Your data transformation logic
    result = pd.merge(table1, table2, on='common_column')
    return result
```

4. The transform will receive Metabase tables as pandas DataFrames
5. Return a DataFrame that will become the output table

## Troubleshooting

### View Service Logs

```bash
make logs
```

### Common Issues

1. **Connection refused**: Ensure the Python service is running (`make status`)
2. **Mount path errors**: Verify `/tmp/python-exec-work` exists and is writable
3. **Transform timeouts**: Check the `transform-timeout` setting if jobs are timing out

## Development Commands

- `make test` - Run the full test suite
- `make rebuild` - Rebuild the image from scratch
- `make clean` - Remove all containers and images
- `make help` - Show all available commands

## Security Notes

The Python execution service runs with resource limits:
- Memory: 1GB maximum
- CPU time: 60 seconds per execution
- Process isolation in separate containers
- File system access limited to working directory
