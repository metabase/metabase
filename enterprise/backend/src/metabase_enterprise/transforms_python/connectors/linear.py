"""Linear issues connector.

Requires the LINEAR_API_KEY secret (a personal API key `lin_api_...` or an
OAuth access token). Syncs incrementally on `updatedAt`; pair with an
incremental target using merge key `id`.
"""

import os

import pandas as pd
import requests

GRAPHQL_URL = "https://api.linear.app/graphql"
LINEAR_TEAM = "{{team}}"  # team key, e.g. "GAD"; leave empty for all teams

COLUMNS = [
    "id",
    "identifier",
    "title",
    "status",
    "team",
    "assignee",
    "creator",
    "priority",
    "estimate",
    "url",
    "created_at",
    "updated_at",
    "completed_at",
]

QUERY = """
query Issues($filter: IssueFilter, $after: String) {
  issues(filter: $filter, first: 100, after: $after, orderBy: updatedAt) {
    nodes {
      id identifier title url priority estimate
      state { name }
      team { key }
      assignee { name }
      creator { name }
      createdAt updatedAt completedAt
    }
    pageInfo { hasNextPage endCursor }
  }
}
"""


def _auth_header(key):
    # Personal API keys are sent bare; OAuth access tokens use Bearer
    return key if key.startswith("lin_api_") else f"Bearer {key}"


def _row(issue):
    return {
        "id": issue["id"],
        "identifier": issue["identifier"],
        "title": issue["title"],
        "status": (issue.get("state") or {}).get("name"),
        "team": (issue.get("team") or {}).get("key"),
        "assignee": (issue.get("assignee") or {}).get("name"),
        "creator": (issue.get("creator") or {}).get("name"),
        "priority": issue.get("priority"),
        "estimate": issue.get("estimate"),
        "url": issue.get("url"),
        "created_at": issue.get("createdAt"),
        "updated_at": issue.get("updatedAt"),
        "completed_at": issue.get("completedAt"),
    }


def transform(state=None):
    api_key = os.environ.get("LINEAR_API_KEY")
    if not api_key:
        raise ValueError("Missing LINEAR_API_KEY secret")

    session = requests.Session()
    session.headers.update(
        {"Authorization": _auth_header(api_key), "Content-Type": "application/json"}
    )

    since = (state or {}).get("updated_since")
    filter_ = {}
    if since:
        filter_["updatedAt"] = {"gt": since}
    if LINEAR_TEAM:
        filter_["team"] = {"key": {"eq": LINEAR_TEAM}}

    rows = []
    after = None
    while True:
        resp = session.post(
            GRAPHQL_URL,
            json={"query": QUERY, "variables": {"filter": filter_ or None, "after": after}},
            timeout=60,
        )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("errors"):
            raise RuntimeError(f"Linear API error: {payload['errors']}")
        issues = payload["data"]["issues"]
        rows.extend(_row(issue) for issue in issues["nodes"])
        if not issues["pageInfo"]["hasNextPage"]:
            break
        after = issues["pageInfo"]["endCursor"]

    df = pd.DataFrame(rows).reindex(columns=COLUMNS)
    for col in ("created_at", "updated_at", "completed_at"):
        df[col] = pd.to_datetime(df[col], utc=True)

    new_state = dict(state or {})
    if len(df) and df["updated_at"].notna().any():
        new_state["updated_since"] = df["updated_at"].max().isoformat()

    print(f"Fetched {len(df)} issues from Linear (team={LINEAR_TEAM or 'all'}, since={since})")
    return df, new_state
