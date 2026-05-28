#!/usr/bin/env python3
"""Create Metabase collection/dashboard scaffolding for Collegiate notebooks.

Required environment variables:

  MB_URL       e.g. http://localhost:3000
  MB_USER      Metabase username/email
  MB_PASSWORD  Metabase password

Optional:

  INVENTORY_JSON defaults to /private/tmp/collegiate_notebook_inventory.json
  OUTPUT_JSON    defaults to /private/tmp/collegiate_metabase_scaffold.json

This creates:

  Collegiate Python Reports
  ├── <notebook name>
  │   └── <notebook name> Dashboard

It does not create saved questions, because those require confirmed database
tables and SQL definitions.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


ROOT_COLLECTION = "Collegiate Python Reports"
INVENTORY_PATH = pathlib.Path(
    os.environ.get("INVENTORY_JSON", "/private/tmp/collegiate_notebook_inventory.json")
)
OUTPUT_PATH = pathlib.Path(
    os.environ.get("OUTPUT_JSON", "/private/tmp/collegiate_metabase_scaffold.json")
)


class MetabaseClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session_id: str | None = None

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = None
        headers = {"Content-Type": "application/json"}
        if self.session_id:
            headers["X-Metabase-Session"] = self.session_id
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise RuntimeError(f"{method} {path} failed: {error.code} {detail}") from error
        return json.loads(raw) if raw else {}

    def login(self, username: str, password: str) -> None:
        result = self.request(
            "POST",
            "/api/session",
            {"username": username, "password": password},
        )
        self.session_id = result["id"]

    def collections(self) -> list[dict]:
        result = self.request("GET", "/api/collection")
        if isinstance(result, list):
            return result
        return result.get("data", result.get("collections", []))

    def dashboards(self) -> list[dict]:
        result = self.request("GET", "/api/dashboard")
        if isinstance(result, list):
            return result
        return result.get("data", [])

    def find_collection(self, name: str, parent_id: int | None) -> dict | None:
        for collection in self.collections():
            if collection.get("name") == name and collection.get("parent_id") == parent_id:
                return collection
        return None

    def ensure_collection(self, name: str, parent_id: int | None = None) -> dict:
        existing = self.find_collection(name, parent_id)
        if existing:
            return existing
        body = {"name": name}
        if parent_id is not None:
            body["parent_id"] = parent_id
        return self.request("POST", "/api/collection", body)

    def find_dashboard(self, name: str, collection_id: int) -> dict | None:
        for dashboard in self.dashboards():
            if (
                dashboard.get("name") == name
                and dashboard.get("collection_id") == collection_id
            ):
                return dashboard
        return None

    def ensure_dashboard(self, name: str, collection_id: int, description: str) -> dict:
        existing = self.find_dashboard(name, collection_id)
        if existing:
            return existing
        return self.request(
            "POST",
            "/api/dashboard",
            {
                "name": name,
                "collection_id": collection_id,
                "description": description,
            },
        )


def notebook_collection_name(notebook: str) -> str:
    return notebook.removesuffix(".ipynb")


def main() -> int:
    missing = [name for name in ["MB_URL", "MB_USER", "MB_PASSWORD"] if not os.getenv(name)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        return 2

    if not INVENTORY_PATH.exists():
        print(f"Inventory JSON not found: {INVENTORY_PATH}", file=sys.stderr)
        print("Run: python3 scripts/collegiate_notebook_inventory.py", file=sys.stderr)
        return 2

    inventory = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
    client = MetabaseClient(os.environ["MB_URL"])
    client.login(os.environ["MB_USER"], os.environ["MB_PASSWORD"])

    root = client.ensure_collection(ROOT_COLLECTION)
    root_id = root["id"]
    scaffold = {
        "root_collection": {"name": ROOT_COLLECTION, "id": root_id},
        "notebooks": [],
    }
    print(f"Root collection: {ROOT_COLLECTION} ({root_id})")

    for notebook in inventory:
        collection_name = notebook_collection_name(notebook["notebook"])
        collection = client.ensure_collection(collection_name, root_id)
        dashboard_name = f"{collection_name} Dashboard"
        dashboard = client.ensure_dashboard(
            dashboard_name,
            collection["id"],
            "Scaffolded from Collegiate Python notebook conversion inventory.",
        )
        print(
            f"- {collection_name}: collection {collection['id']}, "
            f"dashboard {dashboard['id']}"
        )
        scaffold["notebooks"].append(
            {
                "notebook": notebook["notebook"],
                "collection_name": collection_name,
                "collection_id": collection["id"],
                "dashboard_name": dashboard_name,
                "dashboard_id": dashboard["id"],
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(scaffold, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
