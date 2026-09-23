---
title: An orchestrating agent waited for its own background subagents with fixed-length foreground `until [ $(date +%s) -ge $end ]; do sleep 5; done` loops of 5 to 10 minutes, and because completion notifications are only delivered after the Bash call returns, finished subagents sat unread for up to 8.5 minutes each.
slug: fixed-sleep-loops-delay-subagent-notifications
kind: agent-behaviour
impact: wasted-time
severity: medium
status: open
area: Bash tool, background Agent task notifications, Monitor tool
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9770215-12da-4ae0-b3b7-9a6c0317621d/subagents/agent-a5a0bba6b0e78148e.jsonl
    lines: 503-544
    date: 2026-09-18
    jev: {any_papercut: 0.80, env_toolchain: 0.87, stale_state: 0.49, verify_mismatch: 0.38, misleading_code: 0.54, hidden_coupling: 0.55, stale_docs: 0.35, tool_footgun: 0.66, flaky: 0.58, agent_bug: 0.76, wasted_effort: 0.52, user_correction: 0.19}
---
## Summary
A review subagent fanned out three reviewer subagents, then waited for them with clock-based sleep loops instead of ending its turn or watching a real condition. The harness queues task notifications while a tool call is running, so each loop ran to its full length even when a reviewer had already finished. About 16 minutes of the review went to idling.

## Symptom
- L503: `end=$(( $(date +%s) + 600 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited` ("Wait up to ten minutes for reviewer agents"), then more loops at L511 (5 min), L523 (7 min), L538 (8 min), L542 (9 min).
- L525 and L527: notifications for two reviewers, stamped 10:44:49 and 10:48:54, arrive after the L523 loop returns at 10:50:50.
- L544: the last reviewer's notification is stamped 11:00:42; the L542 loop started at 11:00:12 and ran until 11:09:15.

## Timeline
- L499-500 (10:37): the agent loads the Monitor tool but does not use it.
- L503-504: 10-minute loop auto-backgrounded; L511-512: 5-minute loop.
- L523-524 (10:43:48-10:50:50): reviewer 1 finished at 10:44:48, reviewer 2 at 10:48:52; both unread until 10:50:50 (6 and 2 minutes idle).
- L538-539 (10:51:56-10:59:58): 8-minute loop, no reviewer finishes.
- L542-543 (11:00:12-11:09:15): reviewer 3 finishes at 11:00:38; 8.5 minutes idle.
- Cost: about 16 minutes of dead time in one review.

## Root cause
Agent habit: waiting on wall-clock time rather than on the subagents' state, inside one blocking Bash call. The harness only surfaces queued task notifications between tool calls. It blocks a bare `sleep N` (seen elsewhere in this session: "To wait for a condition, use Monitor with an until-loop"), but an `until` loop that tests only the clock passes that check.

## Why agents fall for it
"Wait up to N minutes" feels safe and bounded, and nothing tells the agent that notifications are held until the call returns. Ending the turn to wait feels like giving up control.

## Current state
Not checked; harness behaviour, not repo code.

## Suggested fix
- Prompting: after spawning background subagents, do other work or end the turn; completion arrives as a notification.
- If a wait is needed, use Monitor or an until-loop on a real condition (the subagent's output file or task status), not on `date`.
- Harness: treat clock-only `until ...; sleep` loops like a bare `sleep` and block them with the same message.

## Detection signal
Bash commands matching `until \[ "\$\(date \+%s\)" -ge` or long `sleep` loops with descriptions like "Wait for reviewer agents", followed by queued task-notification attachments whose timestamps are earlier than the tool result.

## Raw excerpts
```
L499 [CALL] ToolSearch: {"query": "select:Monitor", "max_results": 1}
L503 [CALL] Bash: end=$(( $(date +%s) + 600 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited
L511 [CALL] Bash: end=$(( $(date +%s) + 300 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited
L523 [CALL] Bash: end=$(( $(date +%s) + 420 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited
L524 [RESULT] waited
L538 [CALL] Bash: end=$(( $(date +%s) + 480 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited
L542 [CALL] Bash: end=$(( $(date +%s) + 540 )); until [ "$(date +%s)" -ge "$end" ]; do sleep 5; done; echo waited
```
