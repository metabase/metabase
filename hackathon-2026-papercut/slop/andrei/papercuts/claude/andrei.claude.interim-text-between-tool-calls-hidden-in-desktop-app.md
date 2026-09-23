---
title: A draft the agent wrote as interim text between tool calls never reached the user, because the desktop app collapses that text into a one-line summary
slug: interim-text-between-tool-calls-hidden-in-desktop-app
kind: tool-quirk
impact: wasted-time
severity: medium
status: open
area: Claude desktop app transcript rendering; agent turn structure (deliverable plus follow-on work in one turn)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/97fb3e20-064e-4e3b-bcd7-74c54eba2291.jsonl
    lines: 1099-1335
    date: 2026-09-16
    jev: {any_papercut: 0.84, env_toolchain: 0.87, stale_state: 0.13, verify_mismatch: 0.17, misleading_code: 0.27, hidden_coupling: 0.44, stale_docs: 0.23, tool_footgun: 0.68, flaky: 0.24, agent_bug: 0.20, wasted_effort: 0.37, user_correction: 0.11}
---
## Summary
Asked to draft a short reply and then extend a doc, the agent produced the draft mid-turn and carried on with research. The desktop app showed the user only a collapsed one-line summary of that text, never the draft itself. The user asked twice where the draft was; the agent then wrote it to a file, sent it, and repeated it in the final message.

## Symptom
L1151-L1156 and L1221-L1228: queued user messages mid-turn asking where the draft is, the second with a screenshot of the collapsed summary. L1234: the agent concludes the app hides text written between tool calls and sends the draft as a file.

## Timeline
- L1099 (16:55 UTC): user asks for a short reply draft, then doc work.
- L1117-L1118: draft written as interim output; the visible line only says a reply was drafted.
- L1151-L1156 (16:56): user asks where the draft is.
- L1221-L1228 (16:58): second request, with a screenshot.
- L1234-L1239 (16:59): draft written to a file and sent with SendUserFile; L1335 repeats it in the final message.
- Cost: two user interruptions within four minutes.

## Root cause
The desktop app renders assistant text emitted between tool calls as collapsed progress summaries; only the final message (and sent files) are shown in full. The agent had no signal that its interim text was invisible.

## Why agents fall for it
In a terminal transcript interim text is visible, so writing the deliverable first and continuing is a natural pattern. Nothing in the tool results tells the agent how the client renders its text.

## Current state
Not checked (client behaviour).

## Suggested fix
- Client: render interim assistant text in full (or at least expandable) rather than only as a summary.
- Harness: tell the agent in the system prompt when interim text is collapsed, so deliverables go in the final message by default.
- Agent habit: finish and end the turn with the deliverable, or push it as a file immediately.

## Detection signal
User messages asking where a deliverable is, or screenshots, right after an assistant summary saying "I've drafted"; drafts appearing only in mid-turn text.

## Raw excerpts
```
L1236 [CALL] SendUserFile: {"files": ["~/Downloads/<draft>.txt"], ...}
```
