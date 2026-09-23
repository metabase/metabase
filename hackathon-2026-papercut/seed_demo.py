#!/usr/bin/env python3
"""Add repeatable demo reports to a running papercuts server."""

import argparse
import json
import os
from urllib.request import Request, urlopen


REPORTS = [
    {
        "repository": "demo/metabase",
        "reporter": "demo-agent-a",
        "report_id": "demo-v1-replay-index-a",
        "title": "[Demo] Git replay leaves worktree index stale after moving branch",
        "description": "An agent uses git replay with its default ref action. The branch ref moves while the worktree index still reflects the old commit, making base files appear staged for deletion.",
    },
    {
        "repository": "demo/metabase",
        "reporter": "demo-agent-b",
        "report_id": "demo-v1-replay-index-b",
        "title": "[Demo] Git replay leaves worktree index stale after moving branch",
        "description": "A second demo reporter sends the same papercut. This demonstrates grouping and distinct-reporter counts.",
    },
    {
        "repository": "demo/metabase",
        "reporter": "demo-agent-a",
        "report_id": "demo-v1-replay-status",
        "title": "[Demo] Git replay leaves worktree status misleading after moving branch",
        "description": "After git replay moves a checked-out branch, git status compares the old index with the new HEAD. An agent may mistake the resulting staged deletions for local edits. Compare against the worktree's previous commit.",
    },
    {
        "repository": "demo/metabase",
        "reporter": "demo-agent-a",
        "report_id": "demo-v1-spice-restack",
        "title": "[Demo] git-spice restack skips a branch in another worktree",
        "description": "git-spice exits successfully even when it skips a checked-out branch and everything above it. An agent must inspect the warnings and restack from each branch's worktree.",
    },
    {
        "repository": "demo/metabase",
        "reporter": "demo-agent-b",
        "report_id": "demo-v1-daemon-probe",
        "title": "[Demo] Sandboxed daemon probe reports kata or roborev unavailable",
        "description": "A sandboxed socket or loopback failure can be mistaken for a stopped host daemon. Retry the existing daemon with escalated access before diagnosing an outage.",
        "category": "tooling",
    },
]


def post(server, route, payload):
    headers = {"Content-Type": "application/json"}
    if token := os.environ.get("PAPERCUTS_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"{server.rstrip('/')}{route}",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    papercut_ids = []
    for report in REPORTS:
        result = post(args.server, "/api/reports", report)
        papercut_ids.append(result["papercut"]["id"])
        print(f"#{papercut_ids[-1]} {report['title']}: {'already present' if result['replay'] else 'recorded'}")
    post(args.server, f"/api/papercuts/{papercut_ids[0]}/related", {"papercut_id": papercut_ids[3], "actor": "seed_demo"})
    print(f"Related #{papercut_ids[0]} and #{papercut_ids[3]} manually")


if __name__ == "__main__":
    main()
