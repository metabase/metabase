#!/usr/bin/env python3
"""Run or dry-run a transform and display results.

Usage:
    python query_transform.py <ref_id>                    # Dry-run by ref_id
    python query_transform.py <file.sql>                  # Dry-run by file (extracts ref_id)
    python query_transform.py --run <ref_id>              # Run (persist) by ref_id
    python query_transform.py --sql "SELECT ..." [--name x] # Quick scratch query

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


def api_request(method: str, url: str, api_key: str, data: dict = None) -> dict:
    """Make request to Metabase API."""
    body = json.dumps(data).encode() if data else None
    headers = {"x-api-key": api_key}
    if data:
        headers["Content-Type"] = "application/json"

    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"Error: {e.code} {e.reason}", file=sys.stderr)
        if error_body:
            print(f"Response: {error_body}", file=sys.stderr)
        sys.exit(1)


def get_ref_id_from_file(file_path: Path) -> str:
    """Extract ref_id from a SQL or Python file."""
    content = file_path.read_text()

    # Try SQL format
    match = re.search(r'^-- ref_id:\s*(\S+)', content, re.MULTILINE)
    if match:
        return match.group(1)

    # Try Python format
    match = re.search(r'^# ref_id:\s*(\S+)', content, re.MULTILINE)
    if match:
        return match.group(1)

    return None


def format_table(rows: list, cols: list = None, max_width: int = 40) -> str:
    """Format rows as an ASCII table."""
    if not rows:
        return "(no rows)"

    # Use column names if provided, otherwise generate headers
    if cols:
        headers = [c.get("name", f"col{i}") for i, c in enumerate(cols)]
    else:
        headers = [f"col{i}" for i in range(len(rows[0]))]

    # Convert all values to strings and truncate
    def fmt(v):
        s = str(v) if v is not None else "NULL"
        return s[:max_width] + "..." if len(s) > max_width else s

    str_rows = [[fmt(v) for v in row] for row in rows]

    # Calculate column widths
    widths = [max(len(h), max((len(r[i]) for r in str_rows), default=0))
              for i, h in enumerate(headers)]

    # Build table
    lines = []
    header_line = " | ".join(h.ljust(w) for h, w in zip(headers, widths))
    lines.append(header_line)
    lines.append("-+-".join("-" * w for w in widths))
    for row in str_rows:
        lines.append(" | ".join(v.ljust(w) for v, w in zip(row, widths)))

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Run or dry-run transforms")
    parser.add_argument("target", nargs="?", help="ref_id or file path")
    parser.add_argument("--run", "-r", action="store_true", help="Run (persist) instead of dry-run")
    parser.add_argument("--sql", "-s", help="Quick SQL query (creates scratch transform)")
    parser.add_argument("--name", "-n", default="_scratch", help="Name for scratch query")
    parser.add_argument("--limit", "-l", type=int, default=20, help="Max rows to display")
    args = parser.parse_args()

    # Read configuration
    env = read_env()
    config = read_workspace_yaml()

    api_key = env.get("METABASE_API_KEY")
    if not api_key:
        print("Error: METABASE_API_KEY not found in .env", file=sys.stderr)
        sys.exit(1)

    base_url = config.get("metabase_url", "http://localhost:3000").rstrip("/")
    ws_id = config.get("id")
    db_id = config.get("database_id")

    if not ws_id:
        print("Error: id not found in workspace.yaml", file=sys.stderr)
        sys.exit(1)

    ws_id = int(ws_id)
    db_id = int(db_id) if db_id else None

    # Handle scratch SQL query
    if args.sql:
        if not db_id:
            print("Error: database_id not found in workspace.yaml", file=sys.stderr)
            sys.exit(1)

        # Create scratch transform
        payload = {
            "name": args.name,
            "source": {
                "type": "query",
                "query": {
                    "type": "native",
                    "native": {"query": args.sql},
                    "database": db_id
                }
            },
            "target": {
                "type": "table",
                "schema": "public",
                "name": args.name.replace(" ", "_").lower()
            }
        }

        url = f"{base_url}/api/ee/workspace/{ws_id}/transform"
        result = api_request("POST", url, api_key, payload)
        ref_id = result.get("ref_id")
        print(f"Created scratch transform: {ref_id}")

        # Dry-run it
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}/dry-run"
        result = api_request("POST", url, api_key)

        rows = result.get("rows", [])
        cols = result.get("cols", [])
        print(f"\nResults ({len(rows)} rows):\n")
        print(format_table(rows[:args.limit], cols))

        if len(rows) > args.limit:
            print(f"\n... and {len(rows) - args.limit} more rows")

        # Delete scratch transform
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}"
        api_request("DELETE", url, api_key)
        print(f"\nDeleted scratch transform: {ref_id}")
        return

    # Handle ref_id or file
    if not args.target:
        parser.print_help()
        sys.exit(1)

    # Check if it's a file
    target_path = Path(args.target)
    if target_path.exists():
        ref_id = get_ref_id_from_file(target_path)
        if not ref_id:
            print(f"Error: No ref_id found in {args.target}. Sync the file first.", file=sys.stderr)
            sys.exit(1)
    else:
        ref_id = args.target

    # Run or dry-run
    if args.run:
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}/run"
        result = api_request("POST", url, api_key)
        status = result.get("status", "unknown")
        rows = result.get("rows_affected", "?")
        print(f"Run complete: {status} ({rows} rows affected)")
    else:
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}/dry-run"
        result = api_request("POST", url, api_key)

        rows = result.get("rows", [])
        cols = result.get("cols", [])
        print(f"Dry-run results ({len(rows)} rows):\n")
        print(format_table(rows[:args.limit], cols))

        if len(rows) > args.limit:
            print(f"\n... and {len(rows) - args.limit} more rows")


if __name__ == "__main__":
    main()
