"""GitHub pull requests stream.

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
    "draft",
    "author",
    "base_branch",
    "head_branch",
    "html_url",
    "created_at",
    "updated_at",
    "closed_at",
    "merged_at",
]


def _row(pr):
    return {
        "id": pr["id"],
        "number": pr["number"],
        "title": pr["title"],
        "state": pr["state"],
        "draft": pr.get("draft"),
        "author": (pr.get("user") or {}).get("login"),
        "base_branch": (pr.get("base") or {}).get("ref"),
        "head_branch": (pr.get("head") or {}).get("ref"),
        "html_url": pr.get("html_url"),
        "created_at": pr.get("created_at"),
        "updated_at": pr.get("updated_at"),
        "closed_at": pr.get("closed_at"),
        "merged_at": pr.get("merged_at"),
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
    # /pulls has no `since` filter: walk newest-first and stop once rows are
    # at/behind the cursor. The boundary row is re-fetched; merge on `id` makes
    # that harmless.
    params = {"state": "all", "per_page": 100, "sort": "updated", "direction": "desc"}

    rows = []
    done = False
    for page in client.paginate(f"/repos/{GITHUB_REPO}/pulls", params=params):
        for pr in page:
            if since and pr.get("updated_at") and pr["updated_at"] < since:
                done = True
                break
            rows.append(_row(pr))
        if done:
            break

    df = pd.DataFrame(rows).reindex(columns=COLUMNS)
    for col in ("created_at", "updated_at", "closed_at", "merged_at"):
        df[col] = pd.to_datetime(df[col], utc=True)

    new_state = dict(state or {})
    if len(df) and df["updated_at"].notna().any():
        new_state["updated_since"] = df["updated_at"].max().isoformat()

    print(f"Fetched {len(df)} pull requests from {GITHUB_REPO} (since={since})")
    return df, new_state
