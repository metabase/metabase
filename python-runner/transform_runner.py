#!/usr/bin/env python3
"""
Transform Runner - Executes user-defined transform functions and saves results as CSV.

This script:
1. Imports the user's code from /sandbox/script.py
2. Creates a db object with read_table method if database connection is provided
3. Calls the transform() function defined by the user with db parameter
4. Saves the returned DataFrame as CSV to the output file
"""
import os
import sys
import traceback
import pandas as pd
from pathlib import Path
try:
    import sqlalchemy
except ImportError:
    sqlalchemy = None


class DatabaseConnection:
    """Database connection wrapper that provides read_table functionality."""
    
    def __init__(self, connection_string=None):
        self.connection_string = connection_string
        self.engine = None
        
        if connection_string and sqlalchemy:
            try:
                self.engine = sqlalchemy.create_engine(connection_string)
                # Test the connection
                with self.engine.connect() as conn:
                    conn.execute(sqlalchemy.text("SELECT 1"))
                print(f"Successfully connected to database: {connection_string[:50]}...", file=sys.stderr)
            except Exception as e:
                print(f"WARNING: Failed to create database engine: {e}", file=sys.stderr)
                self.engine = None
    
    def read_table(self, table_name, schema=None):
        """
        Read a table from the database and return as a pandas DataFrame.
        
        Args:
            table_name: Name of the table to read
            schema: Optional schema name
            
        Returns:
            pandas.DataFrame: The table data
        """
        if not self.engine:
            raise RuntimeError("No database connection available. Please provide a valid db-connection-string.")
        
        try:
            if schema:
                full_table_name = f"{schema}.{table_name}"
            else:
                full_table_name = table_name
            
            query = f"SELECT * FROM {full_table_name}"
            df = pd.read_sql(query, self.engine)
            return df
            
        except Exception as e:
            raise RuntimeError(f"Failed to read table '{full_table_name}': {e}")


def main():
    try:
        # Get the output file path from environment variable
        output_file = os.environ.get('OUTPUT_FILE')
        if not output_file:
            print("ERROR: OUTPUT_FILE environment variable not set", file=sys.stderr)
            sys.exit(1)
        
        # Get database connection string from environment variable
        db_connection_string = os.environ.get('DB_CONNECTION_STRING')
        
        # Create database connection object
        db = DatabaseConnection(db_connection_string)
        
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
        
        # Call the transform function with db parameter
        try:
            # Check function signature to determine if it accepts db parameter
            import inspect
            sig = inspect.signature(script.transform)
            if len(sig.parameters) > 0:
                # Function accepts parameters, pass db
                result = script.transform(db)
            else:
                # Function takes no parameters, call without db for backward compatibility
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
