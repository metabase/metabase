#!/usr/bin/env python3
"""Create a first-pass Metabase dashboard from a StarRez report snapshot.

This imports cards that can be built from one loaded StarRez report table.
By default it targets the stable Next Year snapshot.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


ROOT_COLLECTION = "Collegiate Python Reports"
REPORT_LABEL = os.getenv("COLLEGIATE_REPORT_LABEL", "Next Year Most Recent")
COLLECTION_NAME = os.getenv("COLLEGIATE_COLLECTION_NAME", REPORT_LABEL)
DASHBOARD_NAME = os.getenv("COLLEGIATE_DASHBOARD_NAME", f"{REPORT_LABEL} Dashboard")
DATABASE_ID = 2
TABLE = os.getenv("COLLEGIATE_TABLE", "starrez_data.collegiate_next_year_most_recent")


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
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise RuntimeError(f"{method} {path} failed: {error.code} {detail}") from error
        return json.loads(raw) if raw else {}

    def login(self, username: str, password: str) -> None:
        self.session_id = self.request(
            "POST",
            "/api/session",
            {"username": username, "password": password},
        )["id"]

    def collections(self) -> list[dict]:
        result = self.request("GET", "/api/collection")
        return result if isinstance(result, list) else result.get("data", [])

    def dashboards(self) -> list[dict]:
        result = self.request("GET", "/api/dashboard")
        return result if isinstance(result, list) else result.get("data", [])

    def ensure_collection(self, name: str, parent_id: int | None = None) -> dict:
        for collection in self.collections():
            if collection.get("name") == name and collection.get("parent_id") == parent_id:
                return collection
        body = {"name": name}
        if parent_id is not None:
            body["parent_id"] = parent_id
        return self.request("POST", "/api/collection", body)

    def ensure_dashboard(self, name: str, collection_id: int) -> dict:
        for dashboard in self.dashboards():
            if dashboard.get("name") == name and dashboard.get("collection_id") == collection_id:
                return dashboard
        return self.request(
            "POST",
            "/api/dashboard",
            {
                "name": name,
                "collection_id": collection_id,
                "description": f"First-pass dashboard from the loaded {REPORT_LABEL} StarRez report.",
            },
        )

    def find_card(self, name: str, collection_id: int) -> dict | None:
        result = self.request(
            "GET",
            f"/api/card?f=all&collection_id={collection_id}",
        )
        cards = result if isinstance(result, list) else result.get("data", [])
        for card in cards:
            if card.get("name") == name and card.get("collection_id") == collection_id:
                return card
        return None

    def ensure_card(self, collection_id: int, card: dict) -> dict:
        existing = self.find_card(card["name"], collection_id)
        body = {
            "name": card["name"],
            "dataset_query": {
                "type": "native",
                "database": DATABASE_ID,
                "native": {"query": card["sql"]},
            },
            "display": card["display"],
            "visualization_settings": card.get("visualization_settings", {}),
            "collection_id": collection_id,
        }
        if card.get("description"):
            body["description"] = card["description"]
        if existing:
            return self.request("PUT", f"/api/card/{existing['id']}", body)
        return self.request("POST", "/api/card", body)

    def set_dashboard_cards(self, dashboard_id: int, cards: list[dict]) -> None:
        dashboard = self.request("GET", f"/api/dashboard/{dashboard_id}")
        existing = [
            dashcard
            for dashcard in dashboard.get("dashcards", [])
            if not dashcard.get("card")
            or dashcard["card"].get("name") not in {card["name"] for card in cards}
        ]
        dashcards = existing[:]
        for index, card in enumerate(cards):
            dashcards.append(
                {
                    "id": -(index + 1),
                    "card_id": card["id"],
                    "row": (index // 2) * 8,
                    "col": 0 if index % 2 == 0 else 12,
                    "size_x": 12,
                    "size_y": 8,
                }
            )
        self.request("PUT", f"/api/dashboard/{dashboard_id}", {"dashcards": dashcards})


def money_expr(column: str) -> str:
    return f"nullif(regexp_replace({column}, '[^0-9.-]', '', 'g'), '')::numeric"


def cards() -> list[dict]:
    total_rent = money_expr("total_rent")
    room_rate_amount = money_expr("room_rate_amount")
    return [
        {
            "name": "Overdue Held Bookings by Site",
            "display": "bar",
            "description": f"Converted from MACROS 2026_27 cell 35 using {REPORT_LABEL}.",
            "sql": f"""
with held as (
  select
    room_location_description,
    case
      when current_date - to_date(date_held, 'DD/MM/YYYY') <= 3 then 'Held (<=3d)'
      when current_date - to_date(date_held, 'DD/MM/YYYY') <= 14 then 'Overdue (4-14d)'
      when current_date - to_date(date_held, 'DD/MM/YYYY') <= 30 then 'Overdue (15-30d)'
      else 'Overdue (>30d)'
    end as status
  from {TABLE}
  where lower(trim(entry_status_description)) = 'held'
    and nullif(date_held, '') is not null
)
select
  room_location_description,
  status,
  count(*) as bookings
from held
where status <> 'Held (<=3d)'
group by 1, 2
order by 1, 2
""",
        },
        {
            "name": "Bookings by Site",
            "display": "bar",
            "sql": f"""
select
  room_location_description,
  count(*) as bookings
from {TABLE}
group by 1
order by bookings desc
""",
        },
        {
            "name": "Revenue by Site",
            "display": "bar",
            "sql": f"""
select
  room_location_description,
  sum({total_rent}) as total_rent
from {TABLE}
group by 1
order by total_rent desc
""",
        },
        {
            "name": "Bookings by Booking Type",
            "display": "pie",
            "sql": f"""
select
  booking_type_description,
  count(*) as bookings
from {TABLE}
group by 1
order by bookings desc
""",
        },
        {
            "name": "Agent Bookings",
            "display": "bar",
            "sql": f"""
select
  coalesce(nullif(trim(agents), ''), 'Direct / No agent') as agent,
  count(*) as bookings
from {TABLE}
group by 1
order by bookings desc
limit 25
""",
        },
        {
            "name": "Average Weekly Room Rate by Site",
            "display": "bar",
            "sql": f"""
select
  room_location_description,
  avg({room_rate_amount}) as average_weekly_room_rate
from {TABLE}
group by 1
order by average_weekly_room_rate desc
""",
        },
    ]


def main() -> int:
    missing = [name for name in ["MB_URL", "MB_USER", "MB_PASSWORD"] if not os.getenv(name)]
    if missing:
        raise SystemExit(f"Missing environment variables: {', '.join(missing)}")

    client = MetabaseClient(os.environ["MB_URL"])
    client.login(os.environ["MB_USER"], os.environ["MB_PASSWORD"])

    root = client.ensure_collection(ROOT_COLLECTION)
    collection = client.ensure_collection(COLLECTION_NAME, root["id"])
    dashboard = client.ensure_dashboard(DASHBOARD_NAME, collection["id"])

    imported_cards = []
    for card in cards():
        imported = client.ensure_card(collection["id"], card)
        imported_cards.append({"id": imported["id"], "name": imported["name"]})
        print(f"Card {imported['id']}: {imported['name']}")

    client.set_dashboard_cards(dashboard["id"], imported_cards)
    print(f"Collection {collection['id']}: {COLLECTION_NAME}")
    print(f"Dashboard {dashboard['id']}: {DASHBOARD_NAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
