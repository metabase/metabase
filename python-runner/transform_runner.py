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
try:
    import requests
except ImportError:
    print("ERROR: requests library is required but not available", file=sys.stderr)
    sys.exit(1)


class MetabaseAPIConnection:
    """Metabase API connection wrapper that provides read_table functionality."""

    def __init__(self, metabase_url=None, api_key=None):
        """
        Initialize connection to Metabase API.

        Args:
            metabase_url: Base URL for Metabase API (e.g., http://127.0.0.1:3000)
            api_key: Optional API key for authentication
        """
        self.metabase_url = metabase_url
        self.session = requests.Session()
        # Set API key header if provided
        if api_key:
            self.session.headers['x-api-key'] = api_key

    def read_table(self, table_id, limit=None):
        """
        Read a table from Metabase using the API and return as a pandas DataFrame.

        Args:
            table_id: A table ID
            limit: Optional row limit (defaults to API's default limit)

        Returns:
            pandas.DataFrame: The table data
        """

        table_id = int(table_id)

        try:
            # Build API URL
            url = f"{self.metabase_url}/api/python-runner/table/{table_id}/data"
            params = {}
            if limit:
                params['limit'] = limit

            # Make API request
            response = self.session.get(url, params=params, stream=True)
            response.raise_for_status()

            # # Parse JSONLines response
            # rows = []
            # for line in response.iter_lines(decode_unicode=True):
            #     if line.strip():
            #         data = json.loads(line)
            #         rows.append(data)

            rows = response.json()

            if not rows:
                # Empty table
                return pd.DataFrame()

            # Convert to DataFrame
            df = pd.DataFrame(rows)
            return df

        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Failed to fetch table {table_id} from Metabase API: {e}")
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to parse JSON response for table {table_id}: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to read table {table_id}: {e}")


def main():
    try:
        # Get the output file path from environment variable
        output_file = os.environ.get('OUTPUT_FILE')
        if not output_file:
            print("ERROR: OUTPUT_FILE environment variable not set", file=sys.stderr)
            sys.exit(1)

        # Get Metabase API configuration from environment variables
        metabase_url = os.environ.get('METABASE_URL')
        api_key = os.environ.get('X_API_KEY')

        # Get table ID mapping from environment
        import json
        table_id_mapping_json = os.environ.get('TABLE_ID_MAPPING', '{}')
        table_id_mapping = json.loads(table_id_mapping_json)

        # Create Metabase API connection object
        db = MetabaseAPIConnection(metabase_url, api_key)

        # Import the user's script
        sys.path.insert(0, '/sandbox')

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
                    if param_name in table_id_mapping:
                        table_id = table_id_mapping[param_name]
                        kwargs[param_name] = db.read_table(table_id)
                
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
