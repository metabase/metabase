#!/usr/bin/env python3
"""
Script to validate SQL fixing test cases against a Metabase instance.

This script connects to a Metabase instance via its API, runs test queries from JSON files,
and validates that fixed_query runs successfully while broken_query fails.
It updates the error_message field with actual database error messages.

Usage:
    python validate_sql_fixing_test_cases.py --help
    python validate_sql_fixing_test_cases.py --overwrite-input input.json
    python validate_sql_fixing_test_cases.py \
        --host http://localhost:3000 \
        --username admin@example.com \
        --password admin123 \
        --database-name "Analytics" \
        --overwrite-input \
        --backup \
        input.json
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from src.metabase.client import BenchmarkMetabaseClient
from src.types import MBQL4Query


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Validate SQL fixing test cases against a Metabase instance")

    parser.add_argument(
        "--host", default="http://localhost:3000", help="Metabase host URL (default: http://localhost:3000)"
    )
    parser.add_argument(
        "--username", default="admin@example.com", help="Metabase username (default: admin@example.com)"
    )
    parser.add_argument("--password", default="benchmark123", help="Metabase password (default: benchmark123)")
    parser.add_argument("--database-name", default="Analytics", help="Database name in Metabase (default: Analytics)")
    parser.add_argument(
        "--overwrite-input", action="store_true", help="Overwrite input file with updated error messages"
    )
    parser.add_argument("--backup", action="store_true", help="Create backup of input file before overwriting")
    parser.add_argument("input_files", nargs="+", help="Path(s) to JSON file(s) containing test cases")

    return parser.parse_args()


async def create_metabase_client(host: str, username: str, password: str) -> BenchmarkMetabaseClient:
    """Create and login to a Metabase client."""
    client = BenchmarkMetabaseClient(host, username, password)
    await client.login()
    return client


async def get_database_id_by_name(client: BenchmarkMetabaseClient, database_name: str) -> int:
    """Get database ID by name from Metabase."""
    databases = await client.get_databases()

    for db in databases:
        if db.get("name") == database_name:
            return db["id"]

    # If exact match not found, show available databases
    available_dbs = [db.get("name") for db in databases]
    raise ValueError(f"Database '{database_name}' not found. Available databases: {', '.join(available_dbs)}")


def make_native_query(database_id: int, sql: str) -> dict[str, Any]:
    """Create a native query dictionary for the Metabase API.

    If the SQL contains model references like {{#125-model-name}}, this function
    automatically generates the required template-tags metadata.
    """
    query = MBQL4Query(
        database=database_id,
        type="native",
        native={"query": sql},
    )
    return query.to_mbql(auto_populate_template_tags=True)


async def test_metabase_connection(client: BenchmarkMetabaseClient, database_id: int) -> bool:
    """Test Metabase connection with a simple query."""
    try:
        query = make_native_query(database_id, "SELECT 1 AS test")
        result = await client.run_query(query)
        if "error" not in result and "data" in result:
            print("OK Metabase connection successful")
            return True
        else:
            print(f"FAIL Metabase connection test failed: {result.get('error', 'unknown error')}")
            return False
    except Exception as e:
        print(f"FAIL Metabase connection test failed: {e}")
        return False


async def run_query(client: BenchmarkMetabaseClient, database_id: int, query_sql: str) -> str | None:
    """
    Run a query against the database via Metabase API.

    Returns:
        None if successful, error string if failed
    """
    try:
        query = make_native_query(database_id, query_sql)
        result = await client.run_query(query)

        # Check if there's an error in the response
        if "error" in result:
            return result["error"]

        # Success
        return None
    except Exception as e:
        return f"Unexpected error: {str(e)}"


async def validate_test_case(
    client: BenchmarkMetabaseClient, database_id: int, test_case: dict[str, Any]
) -> dict[str, Any]:
    """
    Validate a single test case against the database.

    Returns updated test case with error_message field populated.
    """
    fixed_query = test_case["fixed_query"]
    broken_query = test_case["broken_query"]
    description = test_case.get("description", "Unknown")

    print(f"Testing: {description}")

    # Test the fixed query - should succeed
    fixed_error = await run_query(client, database_id, fixed_query)

    if fixed_error:
        # Fixed query failed - this is a problem with the test case
        error_msg = f"BAD FIXED_QUERY: {fixed_error}"
        test_case["error_message"] = error_msg
        print(f"  FAIL Fixed query failed: {fixed_error}")
        return test_case

    print("  OK Fixed query ran successfully")

    # Test the broken query - should fail
    broken_error = await run_query(client, database_id, broken_query)

    if not broken_error:
        # Broken query succeeded - this is a problem with the test case
        error_msg = "BAD BROKEN_QUERY: executed without error"
        test_case["error_message"] = error_msg
        print("  FAIL Broken query unexpectedly succeeded")
        return test_case

    # Broken query failed as expected - record the error message
    test_case["error_message"] = broken_error.strip() if broken_error else ""
    print("  OK Broken query failed as expected")

    return test_case


async def process_file(
    client: BenchmarkMetabaseClient, database_id: int, input_path: Path, args
) -> tuple[int, int, int]:
    """Process a single input file and return (good_cases, bad_fixed, bad_broken) counts."""
    if not input_path.exists():
        print(f"FAIL Input file not found: {input_path}")
        sys.exit(1)

    try:
        with open(input_path) as f:
            test_cases = json.load(f)
    except Exception as e:
        print(f"FAIL Failed to load test cases from {input_path}: {e}")
        sys.exit(1)

    if not isinstance(test_cases, list):
        print(f"FAIL Expected JSON array in {input_path}, got {type(test_cases)}")
        sys.exit(1)

    print(f"Loaded {len(test_cases)} test cases from {input_path}")
    print()

    # Validate each test case
    updated_test_cases = []
    bad_fixed_queries = []
    bad_broken_queries = []

    for test_case in test_cases:
        updated_case = await validate_test_case(client, database_id, test_case.copy())
        updated_test_cases.append(updated_case)

        error_msg = updated_case.get("error_message", "")
        if error_msg.startswith("BAD FIXED_QUERY:"):
            bad_fixed_queries.append(updated_case["description"])
        elif error_msg.startswith("BAD BROKEN_QUERY:"):
            bad_broken_queries.append(updated_case["description"])

    print(f"\n\nSUMMARY for {input_path}")

    if bad_fixed_queries:
        print(f"FAIL {len(bad_fixed_queries)} test case(s) with BAD FIXED_QUERY:")
        for desc in bad_fixed_queries:
            print(f"  - {desc}")

    if bad_broken_queries:
        print(f"FAIL {len(bad_broken_queries)} test case(s) with BAD BROKEN_QUERY:")
        for desc in bad_broken_queries:
            print(f"  - {desc}")

    good_cases = len(test_cases) - len(bad_fixed_queries) - len(bad_broken_queries)
    print(f"OK {good_cases} test case(s) validated successfully")

    if bad_fixed_queries or bad_broken_queries:
        print("Please fix the problematic test cases before proceeding.")

    if args.overwrite_input:
        if args.backup:
            backup_path = input_path.with_suffix(f"{input_path.suffix}.backup")
            try:
                backup_path.write_text(input_path.read_text())
                print(f"Backup created: {backup_path}")
            except Exception as e:
                print(f"FAIL Failed to create backup: {e}")
                sys.exit(1)

        try:
            with open(input_path, "w") as f:
                json.dump(updated_test_cases, f, indent=2)
                f.write("\n")
            print(f"Updated test cases written to {input_path}")
        except Exception as e:
            print(f"FAIL Failed to write updated test cases: {e}")
            sys.exit(1)
    else:
        print(f"Use --overwrite-input to save updated error messages to {input_path}")

    return good_cases, len(bad_fixed_queries), len(bad_broken_queries)


async def async_main():
    args = parse_args()

    try:
        client = await create_metabase_client(args.host, args.username, args.password)
    except Exception as e:
        print(f"FAIL Failed to create Metabase connection: {e}")
        sys.exit(1)

    try:
        # Look up database ID by name
        try:
            database_id = await get_database_id_by_name(client, args.database_name)
            print(f"Found database '{args.database_name}' with ID {database_id}")
        except Exception as e:
            print(f"FAIL {e}")
            sys.exit(1)

        if not await test_metabase_connection(client, database_id):
            sys.exit(1)

        total_good_cases = 0
        total_bad_fixed = 0
        total_bad_broken = 0

        for input_file in args.input_files:
            input_path = Path(input_file)
            print(f"Processing {input_path}...")

            good, bad_fixed, bad_broken = await process_file(client, database_id, input_path, args)
            total_good_cases += good
            total_bad_fixed += bad_fixed
            total_bad_broken += bad_broken

        if len(args.input_files) > 1:
            print("\nOVERALL SUMMARY")
            print(f"Files processed: {len(args.input_files)}")
            print(f"OK {total_good_cases} total test case(s) validated successfully")
            if total_bad_fixed:
                print(f"FAIL {total_bad_fixed} total test case(s) with BAD FIXED_QUERY")
            if total_bad_broken:
                print(f"FAIL {total_bad_broken} total test case(s) with BAD BROKEN_QUERY")

        if total_bad_fixed or total_bad_broken:
            sys.exit(1)
    finally:
        # Clean up the client connection
        await client.close()


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
