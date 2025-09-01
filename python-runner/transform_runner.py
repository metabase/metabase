#!/usr/bin/env python3
"""
Transform Runner - Executes user-defined transform functions and saves results as CSV.

This script:
1. Imports the user's code from /sandbox/script.py
2. Creates a db object with read_table method using Metabase API
3. Calls the transform() function defined by the user with db parameter
4. Saves the returned DataFrame as CSV to the output file
"""
import os
import sys
import traceback
import pandas as pd
import json
from pathlib import Path
import io

def read_jsonl_to_array(source):
    """
    Read JSONL data from either a file path or URL.
    
    Args:
        source: Either a file path or URL string
        
    Returns:
        List of parsed JSON objects
    """
    data_array = []
    
    # Check if source is a URL (starts with http:// or https://)
    if source.startswith(('http://', 'https://')):
        # Read directly from URL using urllib
        import urllib.request
        with urllib.request.urlopen(source) as response:
            for line in response:
                line = line.decode('utf-8').strip()
                if line:
                    data_array.append(json.loads(line))
    else:
        # Read from local file
        with open(source, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    data_array.append(json.loads(line))
    
    return data_array

def write_to_s3_url(url, content):
    """
    Write content to S3 using a presigned PUT URL.
    
    Args:
        url: Presigned S3 PUT URL
        content: String or bytes content to write
    """
    import urllib.request
    import urllib.error
    
    if isinstance(content, str):
        content = content.encode('utf-8')
    
    req = urllib.request.Request(url, data=content, method='PUT')
    req.add_header('Content-Type', 'text/plain')
    
    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        print(f"Failed to write to S3: {e.code} {e.reason}", file=sys.stderr)
        raise

def read_table(table_source, limit=None):
    """
    Read a table from either a local file or S3 URL and return as a pandas DataFrame.

    Args:
        table_source: Either a file path or S3 presigned URL
        limit: Optional row limit (defaults to API's default limit)

    Returns:
        pandas.DataFrame: The table data
    """

    try:
        rows = read_jsonl_to_array(table_source)

        if not rows:
            # Empty table
            return pd.DataFrame()

        # Convert to DataFrame
        df = pd.DataFrame(rows)
        return df

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON response for table: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to read table from {table_source}: {e}")


def main():
    # Capture stdout and stderr
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    
    try:
        # Redirect stdout and stderr to capture
        sys.stdout = stdout_capture
        sys.stderr = stderr_capture
        
        # Get output URLs from environment variables
        output_url = os.environ.get('OUTPUT_URL')
        stdout_url = os.environ.get('STDOUT_URL')
        stderr_url = os.environ.get('STDERR_URL')
        
        # For backward compatibility, support OUTPUT_FILE as well
        output_file = os.environ.get('OUTPUT_FILE')
        
        if not output_url and not output_file:
            print("ERROR: Neither OUTPUT_URL nor OUTPUT_FILE environment variable set", file=original_stderr)
            sys.exit(1)

        # TABLE_FILE_MAPPING contains either file paths or S3 presigned URLs
        table_file_mapping_json = os.environ.get('TABLE_FILE_MAPPING', '{}')
        table_file_mapping = json.loads(table_file_mapping_json)

        # Import the user's script
        sys.path.insert(0, '.')

        # Import and execute the user's code
        try:
            import script
        except ImportError as e:
            print(f"ERROR: Failed to import user script: {e}", file=sys.stderr)
            sys.exit(1)

        # Check if transform function exists
        if not hasattr(script, 'transform'):
            print("ERROR: User script must define a 'transform()' function", file=sys.stderr)
            sys.exit(1)

        # Call the transform function with named table parameters
        try:
            # Check function signature to determine parameters
            import inspect
            sig = inspect.signature(script.transform)
            if len(sig.parameters) > 0:
                # Build kwargs with DataFrames for each named table
                kwargs = {}
                for param_name in sig.parameters:
                    if param_name in table_file_mapping:
                        table_source = table_file_mapping[param_name]
                        kwargs[param_name] = read_table(table_source)

                # Call transform with named arguments
                result = script.transform(**kwargs)
            else:
                # Function takes no parameters, call without arguments for backward compatibility
                result = script.transform()
        except Exception as e:
            print(f"ERROR: Transform function failed: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

        # Validate that result is a pandas DataFrame
        if not isinstance(result, pd.DataFrame):
            print(f"ERROR: Transform function must return a pandas DataFrame, got {type(result)}", file=sys.stderr)
            sys.exit(1)

        # Save the DataFrame as CSV
        try:
            csv_buffer = io.StringIO()
            result.to_csv(csv_buffer, index=False)
            csv_content = csv_buffer.getvalue()
            
            # Write to S3 URL if provided, otherwise to file
            if output_url:
                write_to_s3_url(output_url, csv_content)
                print(f"Successfully saved {len(result)} rows to CSV")
            else:
                # Fallback to file for backward compatibility
                result.to_csv(output_file, index=False)
                print(f"Successfully saved {len(result)} rows to CSV")
        except Exception as e:
            print(f"ERROR: Failed to save DataFrame as CSV: {e}")
            traceback.print_exc()
            sys.exit(1)

    except Exception as e:
        print(f"FATAL ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Restore original stdout/stderr
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        
        # Get captured output
        stdout_content = stdout_capture.getvalue()
        stderr_content = stderr_capture.getvalue()
        
        # Write captured output to S3 if URLs provided
        try:
            if stdout_url and stdout_content:
                write_to_s3_url(stdout_url, stdout_content)
            if stderr_url and stderr_content:
                write_to_s3_url(stderr_url, stderr_content)
        except Exception as e:
            print(f"Failed to write logs to S3: {e}", file=original_stderr)
        
        # Also print to original stdout/stderr for local debugging
        if stdout_content:
            print(stdout_content, file=original_stdout, end='')
        if stderr_content:
            print(stderr_content, file=original_stderr, end='')

if __name__ == "__main__":
    main()
