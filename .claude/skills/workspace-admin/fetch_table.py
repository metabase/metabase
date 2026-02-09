#!/usr/bin/env python3
"""Fetch table metadata from Metabase API and save as YAML.

Usage:
    python fetch_table.py <table_id>              # Fetch by ID
    python fetch_table.py --name <table_name>     # Fetch by name
    python fetch_table.py --list                  # List all tables
    python fetch_table.py --all                   # Fetch all tables

Reads configuration from .env and workspace.yaml in current directory.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def read_env():
    """Read .env file and return dict of values."""
    env = {}
    env_path = Path(".env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def read_workspace_yaml():
    """Read workspace.yaml and return dict of values."""
    config = {}
    ws_path = Path("workspace.yaml")
    if ws_path.exists():
        for line in ws_path.read_text().splitlines():
            if ":" in line:
                key, _, value = line.partition(":")
                config[key.strip()] = value.strip().strip('"').strip("'")
    return config


def api_get(url: str, api_key: str) -> dict:
    """Make GET request to Metabase API."""
    req = Request(url, headers={"x-api-key": api_key})
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        print(f"Error: {e.code} {e.reason}", file=sys.stderr)
        sys.exit(1)


def to_yaml(data: dict, indent: int = 0) -> str:
    """Convert dict to YAML string (simple implementation)."""
    lines = []
    prefix = "  " * indent

    for key, value in data.items():
        if value is None:
            lines.append(f"{prefix}{key}:")
        elif isinstance(value, bool):
            lines.append(f"{prefix}{key}: {str(value).lower()}")
        elif isinstance(value, (int, float)):
            lines.append(f"{prefix}{key}: {value}")
        elif isinstance(value, str):
            # Quote if contains special chars
            if any(c in value for c in ":#{}[]|>&*!?"):
                lines.append(f'{prefix}{key}: "{value}"')
            else:
                lines.append(f"{prefix}{key}: {value}")
        elif isinstance(value, list):
            lines.append(f"{prefix}{key}:")
            for item in value:
                if isinstance(item, dict):
                    first = True
                    for k, v in item.items():
                        if first:
                            lines.append(f"{prefix}  - {k}: {v if v is not None else ''}")
                            first = False
                        else:
                            lines.append(f"{prefix}    {k}: {v if v is not None else ''}")
                else:
                    lines.append(f"{prefix}  - {item}")
        elif isinstance(value, dict):
            lines.append(f"{prefix}{key}:")
            lines.append(to_yaml(value, indent + 1))

    return "\n".join(lines)


def fetch_table_metadata(base_url: str, api_key: str, table_id: int) -> dict:
    """Fetch table metadata and convert to our YAML schema."""
    url = f"{base_url}/api/table/{table_id}/query_metadata"
    data = api_get(url, api_key)

    columns = []
    for field in data.get("fields", []):
        col = {
            "name": field.get("name"),
            "type": field.get("base_type", "").replace("type/", ""),
        }
        if field.get("semantic_type"):
            col["semantic_type"] = field["semantic_type"].replace("type/", "")
        if field.get("description"):
            col["description"] = field["description"]
        if field.get("fk_target_field_id"):
            col["fk_target_field_id"] = field["fk_target_field_id"]
        columns.append(col)

    return {
        "name": data.get("name"),
        "schema": data.get("schema"),
        "database_id": data.get("db_id"),
        "table_id": data.get("id"),
        "columns": columns,
    }


def list_tables(base_url: str, api_key: str, database_id: int) -> list:
    """List all tables in the database."""
    # Use /api/table?db_id=X instead of /api/database/X/metadata
    # The metadata endpoint may require different permissions
    url = f"{base_url}/api/table?db_id={database_id}"
    return api_get(url, api_key)


def save_table_yaml(table_data: dict, output_dir: Path = Path("tables")):
    """Save table metadata as YAML file."""
    output_dir.mkdir(exist_ok=True)
    name = table_data["name"]
    # Sanitize filename
    safe_name = re.sub(r'[^\w\-]', '_', name.lower())
    output_path = output_dir / f"{safe_name}.yaml"

    yaml_content = to_yaml(table_data)
    output_path.write_text(yaml_content + "\n")
    print(f"Saved: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Fetch table metadata from Metabase")
    parser.add_argument("table_id", nargs="?", type=int, help="Table ID to fetch")
    parser.add_argument("--name", "-n", help="Fetch table by name")
    parser.add_argument("--list", "-l", action="store_true", help="List all tables")
    parser.add_argument("--all", "-a", action="store_true", help="Fetch all tables")
    parser.add_argument("--output", "-o", default="tables", help="Output directory")
    args = parser.parse_args()

    # Read configuration
    env = read_env()
    config = read_workspace_yaml()

    api_key = env.get("METABASE_API_KEY")
    if not api_key:
        print("Error: METABASE_API_KEY not found in .env", file=sys.stderr)
        sys.exit(1)

    base_url = config.get("metabase_url", "http://localhost:3000").rstrip("/")
    database_id = config.get("database_id")

    if not database_id:
        print("Error: database_id not found in workspace.yaml", file=sys.stderr)
        sys.exit(1)

    database_id = int(database_id)
    output_dir = Path(args.output)

    # List tables
    if args.list:
        tables = list_tables(base_url, api_key, database_id)
        print(f"{'ID':<8} {'Schema':<20} {'Name':<40}")
        print("-" * 68)
        for t in sorted(tables, key=lambda x: (x.get("schema", ""), x.get("name", ""))):
            print(f"{t['id']:<8} {t.get('schema', ''):<20} {t['name']:<40}")
        return

    # Fetch all tables
    if args.all:
        tables = list_tables(base_url, api_key, database_id)
        for t in tables:
            try:
                data = fetch_table_metadata(base_url, api_key, t["id"])
                save_table_yaml(data, output_dir)
            except Exception as e:
                print(f"Error fetching {t['name']}: {e}", file=sys.stderr)
        return

    # Fetch by name
    if args.name:
        tables = list_tables(base_url, api_key, database_id)
        matches = [t for t in tables if t["name"].lower() == args.name.lower()]
        if not matches:
            # Try partial match
            matches = [t for t in tables if args.name.lower() in t["name"].lower()]
        if not matches:
            print(f"Error: No table found matching '{args.name}'", file=sys.stderr)
            sys.exit(1)
        if len(matches) > 1:
            print(f"Multiple matches for '{args.name}':")
            for t in matches:
                print(f"  {t['id']}: {t.get('schema', '')}.{t['name']}")
            sys.exit(1)
        table_id = matches[0]["id"]
    elif args.table_id:
        table_id = args.table_id
    else:
        parser.print_help()
        sys.exit(1)

    # Fetch and save
    data = fetch_table_metadata(base_url, api_key, table_id)
    save_table_yaml(data, output_dir)


if __name__ == "__main__":
    main()
