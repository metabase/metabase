#!/usr/bin/env python3
"""Sync a transform file to the Metabase workspace API.

Usage:
    python sync_transform.py <file.sql>           # Sync a SQL file
    python sync_transform.py <file.py>            # Sync a Python file
    python sync_transform.py --all                # Sync all files
    python sync_transform.py --run <file.sql>     # Sync and run

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


def parse_sql_file(file_path: Path) -> dict:
    """Parse a SQL file with header comments."""
    content = file_path.read_text()
    lines = content.splitlines()

    metadata = {}
    body_start = 0

    for i, line in enumerate(lines):
        if line.startswith("-- ") and ":" in line:
            key_value = line[3:]  # Remove "-- "
            key, _, value = key_value.partition(":")
            metadata[key.strip()] = value.strip()
        elif line.strip() and not line.startswith("--"):
            body_start = i
            break
        elif line.strip() == "":
            # Empty line after headers
            body_start = i + 1

    # Find first non-empty, non-comment line for body start
    for i in range(body_start, len(lines)):
        if lines[i].strip() and not lines[i].startswith("--"):
            body_start = i
            break

    body = "\n".join(lines[body_start:])

    return {
        "name": metadata.get("name", file_path.stem),
        "description": metadata.get("description"),
        "target_schema": metadata.get("target_schema", "public"),
        "target_table": metadata.get("target_table", file_path.stem),
        "ref_id": metadata.get("ref_id"),
        "body": body,
        "type": "sql"
    }


def parse_python_file(file_path: Path) -> dict:
    """Parse a Python file with header comments."""
    content = file_path.read_text()
    lines = content.splitlines()

    metadata = {}
    body_start = 0

    for i, line in enumerate(lines):
        if line.startswith("# ") and ":" in line:
            key_value = line[2:]  # Remove "# "
            key, _, value = key_value.partition(":")
            metadata[key.strip()] = value.strip()
        elif line.strip() and not line.startswith("#"):
            body_start = i
            break

    body = "\n".join(lines[body_start:])

    # Parse source_tables JSON
    source_tables = {}
    if metadata.get("source_tables"):
        try:
            source_tables = json.loads(metadata["source_tables"])
        except json.JSONDecodeError:
            print(f"Warning: Invalid source_tables JSON in {file_path}", file=sys.stderr)

    return {
        "name": metadata.get("name", file_path.stem),
        "description": metadata.get("description"),
        "target_schema": metadata.get("target_schema", "public"),
        "target_table": metadata.get("target_table", file_path.stem),
        "ref_id": metadata.get("ref_id"),
        "source_tables": source_tables,
        "body": body,
        "type": "python"
    }


def build_api_payload(parsed: dict, database_id: int) -> dict:
    """Build the API request payload from parsed file data."""
    if parsed["type"] == "sql":
        source = {
            "type": "query",
            "query": {
                "type": "native",
                "native": {"query": parsed["body"]},
                "database": database_id
            }
        }
    else:  # python
        source = {
            "type": "python",
            "source-tables": parsed["source_tables"],
            "body": parsed["body"]
        }

    payload = {
        "name": parsed["name"],
        "source": source,
        "target": {
            "type": "table",
            "schema": parsed["target_schema"],
            "name": parsed["target_table"]
        }
    }

    if parsed.get("description"):
        payload["description"] = parsed["description"]

    return payload


def add_ref_id_to_file(file_path: Path, ref_id: str):
    """Add ref_id to file header."""
    content = file_path.read_text()
    lines = content.splitlines()

    # Determine comment style
    is_python = file_path.suffix == ".py"
    comment_prefix = "# " if is_python else "-- "
    target_line_prefix = f"{comment_prefix}target_table:"

    # Find target_table line and insert ref_id after it
    new_lines = []
    added = False
    for line in lines:
        new_lines.append(line)
        if not added and line.startswith(target_line_prefix):
            new_lines.append(f"{comment_prefix}ref_id: {ref_id}")
            added = True

    if not added:
        # If no target_table found, add at the beginning after other headers
        for i, line in enumerate(lines):
            if not line.startswith(comment_prefix) or ":" not in line:
                new_lines = lines[:i] + [f"{comment_prefix}ref_id: {ref_id}"] + lines[i:]
                break

    file_path.write_text("\n".join(new_lines) + "\n")


def sync_file(file_path: Path, base_url: str, api_key: str, ws_id: int, db_id: int, run: bool = False):
    """Sync a single file to the workspace."""
    # Parse file
    if file_path.suffix == ".sql":
        parsed = parse_sql_file(file_path)
    elif file_path.suffix == ".py":
        parsed = parse_python_file(file_path)
    else:
        print(f"Skipping unsupported file: {file_path}", file=sys.stderr)
        return

    payload = build_api_payload(parsed, db_id)
    ref_id = parsed.get("ref_id")

    if ref_id:
        # Update existing transform
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}"
        result = api_request("PUT", url, api_key, payload)
        print(f"Updated: {file_path} ({ref_id})")
    else:
        # Create new transform
        url = f"{base_url}/api/ee/workspace/{ws_id}/transform"
        result = api_request("POST", url, api_key, payload)
        new_ref_id = result.get("ref_id")
        if new_ref_id:
            add_ref_id_to_file(file_path, new_ref_id)
            print(f"Created: {file_path} -> {new_ref_id}")
            ref_id = new_ref_id
        else:
            print(f"Warning: No ref_id returned for {file_path}", file=sys.stderr)

    # Run transform if requested
    if run and ref_id:
        run_url = f"{base_url}/api/ee/workspace/{ws_id}/transform/{ref_id}/run"
        run_result = api_request("POST", run_url, api_key)
        status = run_result.get("status", "unknown")
        rows = run_result.get("rows_affected", "?")
        print(f"  Run: {status} ({rows} rows)")


def main():
    parser = argparse.ArgumentParser(description="Sync transform files to Metabase workspace")
    parser.add_argument("files", nargs="*", help="Files to sync")
    parser.add_argument("--all", "-a", action="store_true", help="Sync all files in questions/ and transforms/")
    parser.add_argument("--run", "-r", action="store_true", help="Run transforms after syncing")
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
    if not db_id:
        print("Error: database_id not found in workspace.yaml", file=sys.stderr)
        sys.exit(1)

    ws_id = int(ws_id)
    db_id = int(db_id)

    # Collect files to sync
    files = []
    if args.all:
        for pattern in ["questions/*.sql", "transforms/*.sql", "transforms/*.py"]:
            files.extend(Path(".").glob(pattern))
    else:
        files = [Path(f) for f in args.files]

    if not files:
        print("No files to sync. Use --all or specify files.", file=sys.stderr)
        sys.exit(1)

    # Sync each file
    for file_path in sorted(files):
        if file_path.exists():
            sync_file(file_path, base_url, api_key, ws_id, db_id, run=args.run)
        else:
            print(f"File not found: {file_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
