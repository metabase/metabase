---
title: Driving github.com through the Chrome extension to attach screenshots to PR descriptions failed right after each navigation ("No URL available for active tab"), so the user had to upload the images by hand
slug: chrome-extension-loses-github-tab-url
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown # cause not established; GitHub has no API for attaching images to PR bodies, so browser automation is the only agent path
area: Claude in Chrome extension, github.com PR pages, PR description screenshots
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/777aa5d5-083a-4f62-99f6-2f91f01b0a26.jsonl
    lines: 1304-1385
    date: 2026-09-07
    jev: {any_papercut: 0.82, env_toolchain: 0.92, stale_state: 0.28, verify_mismatch: 0.23, misleading_code: 0.26, hidden_coupling: 0.38, stale_docs: 0.24, tool_footgun: 0.77, flaky: 0.62, agent_bug: 0.23, wasted_effort: 0.52, user_correction: 0.09}
---
## Summary
The user wanted local test screenshots in the PR descriptions. The agent navigated the extension's tab to the PR; every subsequent action (JavaScript, screenshot, find) failed with "No URL available for active tab", including in a freshly created tab. The agent closed both tabs and asked the user to drag the files into a comment box and paste back the generated asset URLs.

## Symptom
- L1317, L1323, L1337, L1354: `Failed to execute ...: No URL available for active tab` immediately after `Navigated to https://github.com/metabase/metabase/pull/81200`.

## Timeline
- L1304-L1317: navigate succeeds, first JS action fails.
- L1322-L1331: wait and screenshot fail; tab context shows an empty URL.
- L1336-L1354: re-navigate and a new tab, same failure.
- L1367-L1385: tabs closed, manual upload steps handed to the user.
- Cost: 8 tool calls and a manual step for the user.

## Root cause
Unknown. The extension reports the tab URL as empty after navigating to github.com; whether this is GitHub page security, the extension, or the tab group is not visible in the transcript.

## Why agents fall for it
Uploading images to a PR body has no gh or REST path, so the browser is the obvious route and the first navigate call reports success.

## Current state
Not checked.

## Suggested fix
- Document the manual path (drag images into a comment box, copy the user-attachments URLs) so agents skip the browser attempt.
- If screenshots are routine, host them somewhere scriptable and link them.

## Detection signal
`No URL available for active tab` after a successful `navigate` to github.com.

## Raw excerpts
```
L1305 [RESULT] Navigated to https://github.com/metabase/metabase/pull/81200 | ... tabId 28677458: "github.com" ("https://github.com/metabase/metabase/pull/81200")
L1317 [RESULT (ERROR)] actions[0] (javascript_tool:javascript_exec) failed: Failed to execute JavaScript: No URL available for active tab (0 completed, 1 remaining)
L1331 [RESULT] {"availableTabs":[{"tabId":28677458,"title":"","url":""}],"selectedTabId":28677458, ...}
L1337 [RESULT (ERROR)] [navigate] Navigated to https://github.com/metabase/metabase/pull/81200 | [computer:wait] Waited for 3 seconds | actions[2] (computer:screenshot) failed: Failed to execute action: No URL available for active tab
L1354 [RESULT (ERROR)] [navigate] Navigated to https://github.com/metabase/metabase/pull/81200 | ... actions[2] (computer:screenshot) failed: Failed to execute action: No URL available for active tab
```
