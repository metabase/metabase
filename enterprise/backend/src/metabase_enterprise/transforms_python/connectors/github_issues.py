"""GitHub issues stream (excludes pull requests).

Requires the GITHUB_TOKEN secret (a PAT or OAuth token with repo read scope).
Syncs incrementally on `updated_at`; pair with an incremental target using
merge key `id`.
"""

import os

import pandas as pd
from dlt.sources.helpers.rest_client import RESTClient
from dlt.sources.helpers.rest_client.auth import BearerTokenAuth
from dlt.sources.helpers.rest_client.paginators import HeaderLinkPaginator

GITHUB_REPO = "{{repo}}"  # e.g. "metabase/metabase"

COLUMNS = [
    "id",
    "number",
    "title",
    "state",
    "author",
    "labels",
    "comments",
    "html_url",
    "created_at",
    "updated_at",
    "closed_at",
]


def _row(issue):
    return {
        "id": issue["id"],
        "number": issue["number"],
        "title": issue["title"],
        "state": issue["state"],
        "author": (issue.get("user") or {}).get("login"),
        "labels": [label["name"] for label in issue.get("labels") or []],
        "comments": issue.get("comments"),
        "html_url": issue.get("html_url"),
        "created_at": issue.get("created_at"),
        "updated_at": issue.get("updated_at"),
        "closed_at": issue.get("closed_at"),
    }


def transform(state=None):
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise ValueError("Missing GITHUB_TOKEN secret")

    client = RESTClient(
        base_url="https://api.github.com",
        auth=BearerTokenAuth(token),
        paginator=HeaderLinkPaginator(),
    )

    since = (state or {}).get("updated_since")
    # `since` is inclusive, so the newest already-synced row is re-fetched;
    # harmless because the target merges on `id`.
    params = {"state": "all", "per_page": 100, "sort": "updated", "direction": "asc"}
    if since:
        params["since"] = since

    rows = []
    for page in client.paginate(f"/repos/{GITHUB_REPO}/issues", params=params):
        for issue in page:
            # the issues endpoint interleaves PRs; those belong to the pull-requests stream
            if "pull_request" not in issue:
                rows.append(_row(issue))

    df = pd.DataFrame(rows).reindex(columns=COLUMNS)
    for col in ("created_at", "updated_at", "closed_at"):
        df[col] = pd.to_datetime(df[col], utc=True)

    new_state = dict(state or {})
    if len(df) and df["updated_at"].notna().any():
        new_state["updated_since"] = df["updated_at"].max().isoformat()

    print(f"Fetched {len(df)} issues/PRs from {GITHUB_REPO} (since={since})")
    return df, new_state
