#!/usr/bin/env python3
"""Create Metabase cards comparing This Year and Next Year StarRez snapshots."""

from __future__ import annotations

import os

from collegiate_next_year_cards import MetabaseClient, money_expr


ROOT_COLLECTION = "Collegiate Python Reports"
COLLECTION_NAME = "Year-on-Year Most Recent"
DASHBOARD_NAME = "Year-on-Year Most Recent Dashboard"
DATABASE_ID = 2
THIS_YEAR_TABLE = "starrez_data.collegiate_this_year_most_recent"
NEXT_YEAR_TABLE = "starrez_data.collegiate_next_year_most_recent"


def union_sql(select_sql: str) -> str:
    return f"""
with reports as (
  select '2025/2026' as academic_year, *
  from {THIS_YEAR_TABLE}
  union all
  select '2026/2027' as academic_year, *
  from {NEXT_YEAR_TABLE}
)
{select_sql}
"""


def valid_date_expr(column: str) -> str:
    return f"case when {column} ~ '^\\d{{2}}/\\d{{2}}/\\d{{4}}$' then to_date({column}, 'DD/MM/YYYY') end"


def cards() -> list[dict]:
    total_rent = money_expr("total_rent")
    held_date = valid_date_expr("date_held")
    return [
        {
            "name": "Bookings by Academic Year and Site",
            "display": "bar",
            "description": "Converted from multi-year Most Recent notebook views using This Year and Next Year snapshots.",
            "sql": union_sql(
                """
select
  academic_year,
  room_location_description,
  count(*) as bookings
from reports
group by 1, 2
order by 2, 1
"""
            ),
        },
        {
            "name": "Revenue by Academic Year and Site",
            "display": "bar",
            "sql": union_sql(
                f"""
select
  academic_year,
  room_location_description,
  sum({total_rent}) as total_rent
from reports
group by 1, 2
order by 2, 1
"""
            ),
        },
        {
            "name": "Weekly Bookings Trend",
            "display": "line",
            "sql": union_sql(
                f"""
select
  academic_year,
  extract(week from {held_date})::int as sales_week,
  count(*) as bookings
from reports
where {held_date} is not null
group by 1, 2
order by 2, 1
"""
            ),
        },
        {
            "name": "Weekly Revenue Trend",
            "display": "line",
            "sql": union_sql(
                f"""
select
  academic_year,
  extract(week from {held_date})::int as sales_week,
  sum({total_rent}) as total_rent
from reports
where {held_date} is not null
group by 1, 2
order by 2, 1
"""
            ),
        },
        {
            "name": "Booking Type Mix by Academic Year",
            "display": "bar",
            "sql": union_sql(
                """
select
  academic_year,
  booking_type_description,
  count(*) as bookings
from reports
group by 1, 2
order by 2, 1
"""
            ),
        },
        {
            "name": "Agent Bookings by Academic Year",
            "display": "bar",
            "sql": union_sql(
                """
select
  academic_year,
  coalesce(nullif(trim(agents), ''), 'Direct / No agent') as agent,
  count(*) as bookings
from reports
group by 1, 2
order by bookings desc
limit 50
"""
            ),
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
