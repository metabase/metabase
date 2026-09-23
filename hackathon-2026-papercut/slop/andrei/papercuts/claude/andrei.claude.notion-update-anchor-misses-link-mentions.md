---
title: The Notion MCP `update_content` command matches each `old_str` against the page's stored text, where pasted Slack links had become mention objects, so anchors copied from a local markdown copy failed with `No matches found` and the whole multi-edit batch was rejected; the retried batch also left a stray `</span>` and orphaned label fragments to clean up.
slug: notion-update-anchor-misses-link-mentions
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: Notion MCP notion-update-page (command update_content), local markdown copy of a Notion page
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/958bfd49-42aa-4849-93a7-f6eb9d893811.jsonl
    lines: 974-1021
    date: 2026-09-02
    jev: {any_papercut: 0.72, env_toolchain: 0.68, stale_state: 0.16, verify_mismatch: 0.13, misleading_code: 0.35, hidden_coupling: 0.68, stale_docs: 0.32, tool_footgun: 0.82, flaky: 0.34, agent_bug: 0.96, wasted_effort: 0.86, user_correction: 0.47}
---
## Summary
The agent kept a local markdown copy of a Notion page and pushed revisions with one large `update_content` call (about 28k characters of old/new pairs). The call failed with a validation error on an anchor that contained Slack links; by the agent's diagnosis the page stores those links as mentions, so the markdown text never matches. It resent the batch with link-free anchors, which succeeded, then needed two more edits to remove leftover fragments.

## Symptom
- L980: `APIResponseError [...] validation_error [...] No matches found for - [bullet text with Slack links]`.
- L987: the agent attributes the failure to six anchors whose Slack links the page stores as mentions, and resends with link-free anchors.
- L1017: the refetched page shows three orphaned label fragments and a stray `</span>` on one line.

## Timeline
- L974: one batch update with many anchors.
- L980: the whole batch rejected on the first unmatched anchor.
- L988-994: resent with anchors that avoid links; success.
- L1006-1021: refetch shows leftovers; two cleanup edits.
- Cost: one failed large call, one resend, two cleanup calls.

## Root cause
Unverified: the agent's reading is that Slack URLs pasted into the page were converted to mention objects, so the page's matchable text differs from the markdown the agent holds; the stray `</span>` suggests the markdown/HTML round trip is lossy.

## Why agents fall for it
The local copy and the fetched page look the same, and the error does not say which part of the anchor failed to match.

## Current state
Not checked (third-party MCP).

## Suggested fix
- Pick anchors from plain text only (no links, mentions or formatting) when editing Notion pages.
- Refetch the page and build anchors from the fetched text, not from a local copy; send smaller batches so one miss does not reject everything.

## Detection signal
`validation_error` with `No matches found for` from `notion-update-page` where the `old_str` contains a URL.

## Raw excerpts
```
L974 [CALL] mcp__notion__notion-update-page: {"page_id": "<page>", "command": "update_content", "content_updates": [{"old_str": "[...]", "new_str": "[...]"}, [...27923 chars...]
L980 [RESULT (ERROR)] {"name":"APIResponseError","code":"validation_error","status":400,[...]"message":"No matches found for - [bullet text containing Slack links] [...]
L994 [RESULT] {"page_id":"<page>"}
L1019 [CALL] mcp__notion__notion-update-page: {"page_id": "<page>", "command": "update_content", "content_updates": [{"old_str": "<line text>\\</span\\>", "new_str": "<line text>"}]}
```
