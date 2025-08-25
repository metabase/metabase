#!/usr/bin/env python3
"""
Transform Runner - Executes user-defined transform functions and saves results as CSV.

This script:
1. Imports the user's code from /sandbox/script.py
2. Calls the transform() function defined by the user
3. Saves the returned DataFrame as CSV to the output file
"""
import os
import sys
import traceback
import pandas as pd
from pathlib import Path

def main():
    try:
        # Get the output file path from environment variable
        output_file = os.environ.get('OUTPUT_FILE')
        if not output_file:
            print("ERROR: OUTPUT_FILE environment variable not set", file=sys.stderr)
            sys.exit(1)
        
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
        
        # Call the transform function
        try:
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