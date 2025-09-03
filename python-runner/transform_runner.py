#!/usr/bin/env python3
"""
Transform Runner - Executes user-defined transform functions and saves results as CSV.

This script:
1. Imports the user's code from script.py in the current working directory
2. Creates a db object with read_table method using Metabase API
3. Calls the transform() function defined by the user with db parameter
4. Saves the returned DataFrame as CSV to the output file
"""
import os
import sys
import traceback
import pandas as pd
import json
import time

class TimestampedWrapper:
    """Wrapper that prefixes each line with unix millisecond timestamp"""
    def __init__(self, original_stream):
        self.original = original_stream
        self.buffer = ""

    def write(self, text):
        if text:
            self.buffer += text
            if '\n' in self.buffer:
                lines = self.buffer.split('\n')
                self.buffer = lines[-1]  # Keep incomplete line in buffer

                for line in lines[:-1]:  # Process complete lines
                    timestamp = int(time.time() * 1000)
                    self.original.write(f"{timestamp} {line}\n")
        return len(text)

    def flush(self):
        if hasattr(self.original, 'flush'):
            self.original.flush()

    def __getattr__(self, name):
        return getattr(self.original, name)

def generate_output_manifest(dataframe):
    """
    Generate a metadata manifest for a pandas DataFrame.

    Args:
        dataframe: pandas DataFrame

    Returns:
        dict: Manifest dictionary
    """
    fields = []
    for column_name, dtype in dataframe.dtypes.items():
        fields.append({
            "name": column_name,
            "dtype": str(dtype)
        })

    return {
        "version": "0.1.0",
        "fields": fields,
        "table_metadata": {}
    }

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
    req.add_header('Content-Length', str(len(content)))

    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        print(f"Failed to write to S3: {e.code} {e.reason}", file=sys.stderr)
        print(f"S3 URL was: {url}", file=sys.stderr)
        print(f"Content length: {len(content)}", file=sys.stderr)
        raise
    except Exception as e:
        print(f"Unexpected error writing to S3: {e}", file=sys.stderr)
        print(f"S3 URL was: {url}", file=sys.stderr)
        raise

def read_table(table_source, manifest_source=None, limit=None):
    """
    Read a table from either a local file or S3 URL and return as a pandas DataFrame.

    Args:
        table_source: Either a file path or S3 presigned URL
        manifest_source: Optional manifest file path or S3 URL containing table metadata
        limit: Optional row limit (defaults to API's default limit)

    Returns:
        pandas.DataFrame: The table data with optional metadata in attrs
    """

    try:
        rows = read_jsonl_to_array(table_source)

        if not rows:
            # Empty table
            return pd.DataFrame()

        # Convert to DataFrame
        df = pd.DataFrame(rows)

        # Load and attach manifest metadata if provided
        if manifest_source:
            try:
                import urllib.request
                import urllib.error

                if manifest_source.startswith(('http://', 'https://')):
                    # Read manifest from URL
                    with urllib.request.urlopen(manifest_source) as response:
                        manifest_content = response.read().decode('utf-8')
                else:
                    # Read manifest from local file
                    with open(manifest_source, 'r', encoding='utf-8') as f:
                        manifest_content = f.read()

                manifest_data = json.loads(manifest_content)
                df.attrs['metabase_manifest'] = manifest_data
            except Exception as e:
                print(f"WARNING: Failed to load manifest from {manifest_source}: {e}", file=sys.stderr)

        return df

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON response for table: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to read table from {table_source}: {e}")


def main():
    # Wrap stdout and stderr with timestamp prefixing
    sys.stdout = TimestampedWrapper(sys.stdout)
    sys.stderr = TimestampedWrapper(sys.stderr)

    # Get output URLs from environment variables
    output_url = os.environ.get('OUTPUT_URL')
    output_manifest_url = os.environ.get('OUTPUT_MANIFEST_URL')

    # TABLE_FILE_MAPPING contains either file paths or S3 presigned URLs
    table_file_mapping_json = os.environ.get('TABLE_FILE_MAPPING', '{}')
    table_file_mapping = json.loads(table_file_mapping_json)

    # TABLE_MANIFEST_MAPPING contains manifest file paths or S3 presigned URLs
    table_manifest_mapping_json = os.environ.get('TABLE_MANIFEST_MAPPING', '{}')
    table_manifest_mapping = json.loads(table_manifest_mapping_json)

    # Import the user's script
    sys.path.insert(0, '.')

    try:

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
                        manifest_source = table_manifest_mapping.get(param_name)
                        kwargs[param_name] = read_table(table_source, manifest_source)

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
            csv_content = result.to_csv(index=False)

            # Write to S3 URL
            write_to_s3_url(output_url, csv_content)
            print(f"Successfully saved {len(result)} rows to CSV")

            # Generate and upload output manifest if URL is provided
            if output_manifest_url:
                try:
                    output_manifest = generate_output_manifest(result)
                    manifest_content = json.dumps(output_manifest, indent=2)
                    write_to_s3_url(output_manifest_url, manifest_content)
                    print(f"Successfully saved output manifest with {len(output_manifest['fields'])} fields")
                except Exception as e:
                    print(f"WARNING: Failed to save output manifest: {e}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Failed to save DataFrame as CSV: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"FATAL ERROR: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
