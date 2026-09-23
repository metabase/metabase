---
title: Navigating the Browser pane to a file:// page outside the project opens an inert "static snapshot" tab where `screenshot` and `get_page_text` fail with "No site is open in this tab" and further navigation is refused
slug: browser-pane-file-url-tab-is-inert-snapshot
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: mcp__Claude_Browser__navigate with file:// URLs; local HTML previews
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a413c65df7ca250d8.jsonl
    lines: 127-157
    date: 2026-09-03
    jev: {any_papercut: 0.85, env_toolchain: 0.87, stale_state: 0.13, verify_mismatch: 0.07, misleading_code: 0.21, hidden_coupling: 0.33, stale_docs: 0.30, tool_footgun: 0.80, flaky: 0.29, agent_bug: 0.25, wasted_effort: 0.78, user_correction: 0.05}
---
## Summary
A subagent rendered two local HTML files and navigated the pane to their file:// URLs. The pane opened them in a new tab as "static snapshots", but every screenshot or page-text call on that tab returned "No site is open in this tab. Use `navigate` first.", and navigating that tab to an http URL was refused because it is "pinned to a local file preview". The agent had to start a local HTTP server, open a fresh tab and close the stuck one.

## Symptom
L128 "opened file:///… in the preview pane (files outside the project folder render as static snapshots)"; L131, L137, L140: "No site is open in this tab."; L147: "Tab tab-1 is pinned to a local file preview and cannot navigate."

## Timeline
- L127-L128: file:// navigation opens tab-1 as a static snapshot.
- L130-L142: screenshot (twice), get_page_text and tabs_select, all failing or doing nothing.
- L144-L153: `python3 -m http.server`, navigation refused on tab-1, new tab-2 created and used.
- Cost: about ten tool calls and a background server to clean up.

## Root cause
The pane treats files outside the project as a read-only snapshot that other actions cannot address, but reports success on the navigate call and a generic error afterwards.

## Why agents fall for it
The navigate call succeeds and names the file, so the tab looks loaded; the later error suggests a missing navigate, which the agent just did.

## Current state
not checked.

## Suggested fix
- Make screenshot and get_page_text work on snapshot tabs, or have navigate return an explicit "snapshot only: serve it over http" hint.
- Workaround: serve local HTML over `python3 -m http.server` and open it in a fresh tab.

## Detection signal
"render as static snapshots" followed by "No site is open in this tab" or "pinned to a local file preview".

## Raw excerpts
```
L127 [CALL mcp__Claude_Browser__navigate] {"url": "file://$SCRATCH/<dir>/before.html"}
L128 [RESULT] opened file://$SCRATCH/<dir>/before.html in the preview pane (files outside the project folder render as static snapshots)
L130 [CALL mcp__Claude_Browser__computer] {"action": "screenshot"}
L131 [RESULT (ERROR)] No site is open in this tab. Use `navigate` first.
L136 [CALL mcp__Claude_Browser__computer] {"action": "screenshot", "tabId": "tab-1"}
L137 [RESULT (ERROR)] No site is open in this tab. Use `navigate` first.
L140 [RESULT (ERROR)] No site is open in this tab. Use `navigate` first.
L146 [CALL mcp__Claude_Browser__navigate] {"url": "http://localhost:8901/before.html", "tabId": "tab-1"}
L147 [RESULT (ERROR)] Tab tab-1 is pinned to a local file preview and cannot navigate. Open a new tab with `tabs_create` and navigate there instead.
```
