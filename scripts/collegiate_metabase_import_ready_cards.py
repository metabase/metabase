#!/usr/bin/env python3
"""Import ready Collegiate visualisation manifest rows as Metabase cards.

Rows are imported only when `status` is `ready` and both `metabase_sql` and
`metabase_database_id` are present. Imported rows are updated in-place in the
manifest with `metabase_card_id` and `metabase_dashcard_id`.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


MANIFEST_PATH = pathlib.Path(
    os.environ.get(
        "MANIFEST_JSON",
        "/private/tmp/collegiate_visualisation_manifest.json",
    )
)
SCAFFOLD_PATH = pathlib.Path(
    os.environ.get(
        "SCAFFOLD_JSON",
        "/private/tmp/collegiate_metabase_scaffold.json",
    )
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

    def create_card(self, row: dict, collection_id: int) -> dict:
        return self.request(
            "POST",
            "/api/card",
            {
                "name": row["metabase_card_name"] or row["title"],
                "description": (
                    f"Converted from {row['notebook']} cell {row['cell_index']} "
                    f"output {row['output_index']}."
                ),
                "dataset_query": {
                    "type": "native",
                    "database": int(row["metabase_database_id"]),
                    "native": {"query": row["metabase_sql"]},
                },
                "display": row["metabase_visualization"] or "table",
                "visualization_settings": row.get("metabase_visualization_settings", {}),
                "collection_id": collection_id,
            },
        )

    def add_card_to_dashboard(self, dashboard_id: int, card_id: int) -> dict:
        dashboard = self.request("GET", f"/api/dashboard/{dashboard_id}")
        dashcards = dashboard.get("dashcards", [])
        next_index = len(dashcards)
        dashcards.append(
            {
                "id": -1,
                "card_id": card_id,
                "row": (next_index // 2) * 8,
                "col": 0 if next_index % 2 == 0 else 12,
                "size_x": 12,
                "size_y": 8,
            }
        )
        updated = self.request(
            "PUT",
            f"/api/dashboard/{dashboard_id}",
            {"dashcards": dashcards},
        )
        return updated["dashcards"][-1]


def required_env() -> list[str]:
    return [name for name in ["MB_URL", "MB_USER", "MB_PASSWORD"] if not os.getenv(name)]


def main() -> int:
    missing = required_env()
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        return 2
    if not MANIFEST_PATH.exists():
        print(f"Manifest JSON not found: {MANIFEST_PATH}", file=sys.stderr)
        return 2
    if not SCAFFOLD_PATH.exists():
        print(f"Scaffold JSON not found: {SCAFFOLD_PATH}", file=sys.stderr)
        return 2

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    scaffold = json.loads(SCAFFOLD_PATH.read_text(encoding="utf-8"))
    by_notebook = {
        item["collection_name"]: item for item in scaffold.get("notebooks", [])
    }

    ready_rows = [
        row
        for row in manifest
        if row.get("status") == "ready"
        and row.get("metabase_sql")
        and row.get("metabase_database_id")
        and not row.get("metabase_card_id")
    ]
    if not ready_rows:
        print("No ready rows to import.")
        return 0

    client = MetabaseClient(os.environ["MB_URL"])
    client.login(os.environ["MB_USER"], os.environ["MB_PASSWORD"])

    imported = 0
    for row in ready_rows:
        scaffold_row = by_notebook.get(row["metabase_collection"] or row["notebook"])
        if not scaffold_row:
            row["status"] = "blocked"
            row["notes"] = f"{row.get('notes', '')}\nMissing scaffold dashboard."
            continue

        card = client.create_card(row, scaffold_row["collection_id"])
        dashcard = client.add_card_to_dashboard(scaffold_row["dashboard_id"], card["id"])
        row["metabase_card_id"] = card["id"]
        row["metabase_dashcard_id"] = dashcard["id"]
        row["status"] = "imported"
        imported += 1
        print(f"Imported card {card['id']}: {row['metabase_card_name'] or row['title']}")

    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Imported {imported} ready cards.")
    print(f"Updated {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
