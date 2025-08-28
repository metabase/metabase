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

def read_jsonl_to_array(filepath):
    data_array = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            data_array.append(json.loads(line.strip()))
    return data_array

def read_table(table_file, limit=None):
    """
        Read a table from Metabase using the API and return as a pandas DataFrame.

        Args:
            table_id: A table ID
            limit: Optional row limit (defaults to API's default limit)

        Returns:
            pandas.DataFrame: The table data
    """

    try:

        rows = read_jsonl_to_array(table_file)

        if not rows:
            # Empty table
            return pd.DataFrame()

        # Convert to DataFrame
        df = pd.DataFrame(rows)
        return df

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON response for table: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to read table: {e}")


def main():
    try:
        # Get the output file path from environment variable
        output_file = os.environ.get('OUTPUT_FILE')
        if not output_file:
            print("ERROR: OUTPUT_FILE environment variable not set", file=sys.stderr)
            sys.exit(1)

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
                        table_file = table_file_mapping[param_name]
                        kwargs[param_name] = read_table(table_file)

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
            result.to_csv(output_file, index=False)
            print(f"Successfully saved {len(result)} rows to CSV", file=sys.stdout)
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
