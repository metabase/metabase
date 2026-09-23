---
title: GitHub's contents API `Last-Modified` header reflects the latest push to the branch, not the last commit that touched the file, so an ingestion connector's freshness check was built on repository activity
slug: github-contents-last-modified-is-repo-head
kind: misleading-signal
impact: introduced-bug
severity: medium
status: open # external API behaviour
area: GitHub REST contents API (`Last-Modified` header); freshness checks for connectors that ingest a file from a GitHub repo
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/56bba9cc-7c7c-4702-a034-a52e575a7302.jsonl
    lines: 385-614
    date: 2026-09-08
    jev: {any_papercut: 0.76, env_toolchain: 0.84, stale_state: 0.28, verify_mismatch: 0.52, misleading_code: 0.25, hidden_coupling: 0.49, stale_docs: 0.34, tool_footgun: 0.74, flaky: 0.29, agent_bug: 0.82, wasted_effort: 0.29, user_correction: 0.10}
---
## Summary
Building a connector (in a repository other than metabase/metabase) that ingests a JSON file from a public GitHub repo, the agent stamped every row with the `Last-Modified` header of the contents API response, documented it as "the last commit that touched the file", and pointed the freshness check at it. An adversarial review later found the header matched a CI-only commit to `.github/`, i.e. the head of the branch. A frozen or moved file would have stayed "fresh" as long as the repo kept getting pushes.

## Symptom
- L385-L386: `gh api -i` on the contents endpoint shows `Last-Modified: Mon, 07 Sep 2026 19:15:51 GMT` next to the file sha.
- L411-L430: the freshness check, the connector code (`response.headers.get("Last-Modified")`) and its README all treat the header as the file's last commit date.
- L577/L582: reviewers verify the header equals the head commit (a `.github/` pin fix), while the file's last commit was two hours earlier.

## Timeline
- L385-L386: header inspected, meaning assumed from its name.
- L411-L430: connector, freshness check and README written on that assumption; offline suite and live load green.
- L575-L582: the user asks for an adversarial review; both reviewers flag the header as repository-level.
- L604-L614: connector rewritten to query the commits API for the file's latest commit, read the file at that sha, and watch that date with severity error.
- Cost: a shipped-looking connector with a freshness check that could never fire for the failure it was meant to catch, and one rewrite of the connector, its fixtures and README.

## Root cause
For the repository contents endpoint GitHub sets `Last-Modified` from the ref being read (the branch head), not per path. The only per-file date is the commits API with `path=`. Verified in the transcript by matching the header to the head commit; GitHub does not document the header per path.

## Why agents fall for it
A header called Last-Modified on a file response reads as file modification time, and on a quiet repo the two values coincide. Local tests use a mock server that serves whatever header the fixture sets, so nothing contradicts the assumption.

## Current state
Not checked (external API behaviour). The transcript shows the connector fixed before its PR.

## Suggested fix
- In agent guidance for API connectors: GitHub contents `Last-Modified` and `ETag` describe the ref and the blob; use `GET /repos/<owner>/<repo>/commits?path=<file>&per_page=1` for the file date.
- Test file-backed connectors so the freshness column cannot come from a response header.

## Detection signal
Connector code reading `headers.get("Last-Modified")` from a GitHub `/contents/` call; README or spec text equating Last-Modified with "last commit".

## Raw excerpts
```
L385 [CALL] Bash: ... gh api -i -H 'Accept: application/vnd.github.raw+json' 'repos/<owner>/<repo>/contents/<path>/data.json?ref=main' | grep -i -E '^HTTP|...|^etag|^last-modified'
L386 [RESULT] ... Etag: "6bd091955b435d30500fa22af030f6d509c4aa88" | Last-Modified: Mon, 07 Sep 2026 19:15:51 GMT
L413 [CALL] Write <connector code>: ... modified = response.headers.get("Last-Modified") ...
L582 [RESULT] ... Should-fix (high): <the freshness column> is HEAD's date, not the file's, so the freshness check watches the wrong thing ...
```
