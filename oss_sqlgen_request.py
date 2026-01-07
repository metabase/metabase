#!/usr/bin/env python3
"""
Test script for OSS SQL generation endpoint.

Usage:
    # List available databases
    python oss_sqlgen_request.py --list-databases

    # List tables in a database
    python oss_sqlgen_request.py --list-tables -d 1

    # Generate SQL with table mentions (table IDs)
    python oss_sqlgen_request.py -d 1 -t 5 -t 6 "Show me all orders with their products"

    # Generate SQL with explicit mention format
    python oss_sqlgen_request.py -d 1 "Show [Orders](metabase://table/5) from last week"

Prerequisites:
    1. Metabase backend running with MB_LLM_OPENAI_API_KEY set
    2. Environment variables for auth:
       - MB_TEST_EMAIL (default: vader@metabase.com)
       - MB_TEST_PASSWORD (default: 123)
       - MB_BASE_URL (default: http://localhost:3000)
"""

import argparse
import os
import sys

import requests


def get_config():
    return {
        "base_url": os.environ.get("MB_BASE_URL", "http://localhost:3000"),
        "email": os.environ.get("MB_TEST_EMAIL", "vader@metabase.com"),
        "password": os.environ.get("MB_TEST_PASSWORD", "123"),
    }


def authenticate(session, config):
    response = session.post(
        f"{config['base_url']}/api/session",
        json={"username": config["email"], "password": config["password"]},
    )
    if response.status_code != 200:
        print(f"Authentication failed: {response.status_code}")
        print(response.text)
        sys.exit(1)
    return response.json()


def list_databases(session, config):
    response = session.get(f"{config['base_url']}/api/database")
    if response.status_code != 200:
        print(f"Failed to list databases: {response.status_code}")
        print(response.text)
        sys.exit(1)

    databases = response.json().get("data", response.json())
    print("\nAvailable Databases:")
    print("-" * 60)
    for db in databases:
        print(f"  ID: {db['id']:3}  Engine: {db.get('engine', 'N/A'):12}  Name: {db['name']}")
    print()


def list_tables(session, config, database_id):
    response = session.get(f"{config['base_url']}/api/database/{database_id}/metadata")
    if response.status_code != 200:
        print(f"Failed to list tables: {response.status_code}")
        print(response.text)
        sys.exit(1)

    data = response.json()
    tables = data.get("tables", [])
    print(f"\nTables in Database {database_id} ({data.get('name', 'Unknown')}):")
    print("-" * 70)
    for table in sorted(tables, key=lambda t: t.get("name", "")):
        schema = table.get("schema", "")
        schema_str = f"{schema}." if schema else ""
        print(f"  ID: {table['id']:4}  Name: {schema_str}{table['name']}")
    print()
    print("Usage example:")
    if tables:
        t = tables[0]
        print(f'  python oss_sqlgen_request.py -d {database_id} -t {t["id"]} "Show all {t["name"]}"')
    print()


def format_prompt_with_mentions(prompt, table_ids, session, config, database_id):
    """Add table mentions to prompt if table IDs are provided."""
    if not table_ids:
        return prompt

    response = session.get(f"{config['base_url']}/api/database/{database_id}/metadata")
    if response.status_code != 200:
        print(f"Warning: Could not fetch table metadata")
        mentions = " ".join(f"[Table](metabase://table/{tid})" for tid in table_ids)
        return f"{prompt}\n\nTables: {mentions}"

    tables = {t["id"]: t for t in response.json().get("tables", [])}

    mentions = []
    for tid in table_ids:
        table = tables.get(tid)
        if table:
            name = table.get("display_name") or table.get("name", f"Table {tid}")
            mentions.append(f"[{name}](metabase://table/{tid})")
        else:
            mentions.append(f"[Table {tid}](metabase://table/{tid})")

    mention_str = ", ".join(mentions)
    return f"{prompt}\n\nUsing tables: {mention_str}"


def generate_sql(session, config, prompt, database_id):
    payload = {
        "prompt": prompt,
        "database_id": database_id,
    }

    response = session.post(
        f"{config['base_url']}/api/llm/generate-sql",
        json=payload,
    )
    return response


def main():
    parser = argparse.ArgumentParser(
        description="Test OSS SQL generation endpoint",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List databases
  python oss_sqlgen_request.py --list-databases

  # List tables in database 1
  python oss_sqlgen_request.py --list-tables -d 1

  # Generate SQL with table IDs (auto-formats mentions)
  python oss_sqlgen_request.py -d 1 -t 5 -t 6 "Show orders with products"

  # Generate SQL with explicit mentions in prompt
  python oss_sqlgen_request.py -d 1 "Show [Orders](metabase://table/5)"
        """,
    )
    parser.add_argument("prompt", nargs="?", help="Natural language query")
    parser.add_argument("--database-id", "-d", type=int, help="Database ID (required for SQL generation)")
    parser.add_argument("--table-id", "-t", type=int, action="append", dest="table_ids", help="Table ID(s) to include (can specify multiple)")
    parser.add_argument("--list-databases", action="store_true", help="List available databases")
    parser.add_argument("--list-tables", action="store_true", help="List tables in database (requires -d)")
    parser.add_argument("--no-auth", action="store_true", help="Skip authentication")
    args = parser.parse_args()

    config = get_config()
    session = requests.Session()

    if not args.no_auth:
        print(f"Authenticating to {config['base_url']}...")
        auth_result = authenticate(session, config)
        print(f"Authenticated as user_id={auth_result.get('id')}")

    if args.list_databases:
        list_databases(session, config)
        return

    if args.list_tables:
        if not args.database_id:
            print("Error: --list-tables requires --database-id (-d)")
            sys.exit(1)
        list_tables(session, config, args.database_id)
        return

    if not args.prompt:
        print("Error: prompt is required for SQL generation")
        print("Use --help for usage examples")
        sys.exit(1)

    if not args.database_id:
        print("Error: --database-id (-d) is required for SQL generation")
        print("Use --list-databases to see available databases")
        sys.exit(1)

    prompt = args.prompt
    if args.table_ids:
        prompt = format_prompt_with_mentions(prompt, args.table_ids, session, config, args.database_id)

    print(f"\nDatabase ID: {args.database_id}")
    print(f"Prompt: {prompt}")
    print("-" * 60)

    response = generate_sql(session, config, prompt, args.database_id)

    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"\nGenerated SQL:\n{result.get('sql', 'No SQL returned')}")
    else:
        print(f"Error: {response.text}")


if __name__ == "__main__":
    main()
