#!/usr/bin/env python3
"""Create stable Collegiate StarRez report snapshot tables through Metabase."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


DATABASE_ID = int(os.getenv("MB_DATABASE_ID", "2"))
SNAPSHOTS = {
    "starrez_data.collegiate_next_year_most_recent": "starrez_data.table_62751",
    "starrez_data.collegiate_this_year_most_recent": "starrez_data.table_59906",
}


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
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}

    def login(self, username: str, password: str) -> None:
        self.session_id = self.request(
            "POST",
            "/api/session",
            {"username": username, "password": password},
        )["id"]

    def query(self, sql: str) -> dict:
        return self.request(
            "POST",
            "/api/dataset",
            {
                "database": DATABASE_ID,
                "type": "native",
                "native": {"query": sql},
            },
        )

    def execute_ddl(self, sql: str) -> None:
        try:
            self.query(sql)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if "Select statement did not produce a ResultSet" not in detail:
                raise RuntimeError(detail) from error


def main() -> int:
    missing = [name for name in ["MB_URL", "MB_USER", "MB_PASSWORD"] if not os.getenv(name)]
    if missing:
        raise SystemExit(f"Missing environment variables: {', '.join(missing)}")

    client = MetabaseClient(os.environ["MB_URL"])
    client.login(os.environ["MB_USER"], os.environ["MB_PASSWORD"])

    for snapshot, source in SNAPSHOTS.items():
        client.execute_ddl(f"create table if not exists {snapshot} as select * from {source}")
        result = client.query(
            f"""
select count(*) as rows, min(term_session_code) as min_term, max(term_session_code) as max_term
from {snapshot}
"""
        )
        rows = result["data"]["rows"][0]
        print(f"{snapshot}: {rows[0]} rows, term {rows[1]} to {rows[2]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
