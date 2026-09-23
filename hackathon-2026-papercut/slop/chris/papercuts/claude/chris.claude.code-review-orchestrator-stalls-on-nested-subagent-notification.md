---
title: /code-review run as a background subagent stalls for 75 min because its finder subagents' completion notifications go to the root session, not to the orchestrator that spawned them
slug: code-review-orchestrator-stalls-on-nested-subagent-notification
kind: tool-quirk
impact: wasted-time
severity: medium
status: unknown
area: Claude Code /code-review skill (orchestrator + finder/verifier subagents), task-notification routing, SendMessage, ReportFindings schema
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
    lines: 6-112
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-aee7cc11cc58331de.jsonl (deleted; reconstructed from redacted chunks)
    lines: 13-82
    date: 2026-08-21
    jev: {subagent of flagged session; scores not in batch}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a78c6410c75364840.jsonl (deleted; reconstructed from redacted chunks)
    lines: 1-49
    date: 2026-08-21
    jev: {subagent of flagged session; scores not in batch}
---
## Summary
The user typed `/code-review`. The main session ran it as a background agent (`aee7cc11cc58331de`, the "orchestrator"). The orchestrator started five finder subagents (Angle A to E) with `run_in_background`. Four finders' results reached it. The fifth, Angle A (`a78c6410c75364840`), finished and returned its JSON as its final message (subagent L43). That notification never reached the orchestrator. The orchestrator ended its turn with "Still waiting on the line-by-line finder (Angle A); then I'll dedup and verify." (orchestrator L45).

Ending the turn fired a `<task-notification>` with `<status>completed</status>` to the **main** session (main L25). The main agent read the result text, not the status, and told the user "still in progress" (L36, L44). Nothing was left to wake the orchestrator. The user had to ask twice ("status?", then "it's been a very long time, check that it's still alive"). The main agent then found that all finders had finished by 12:14 UTC. It was 13:30 UTC, so the review had been stalled for about 75 minutes. It resumed the orchestrator with `SendMessage`.

In parallel, the orchestrator had already sent `SendMessage` to Angle A: "Your completion notification did not reach me. Please reply with only your final JSON array" (orchestrator L50). Angle A replied with `SendMessage {"to": "code-review", ...}`, which was "queued for delivery to code-review at its next tool round" (A L47-48). Angle A's second completion notification then went to the **main** session (main L78: `Agent "Angle A line-by-line scan" finished`). So grandchild completion notifications are routed to the root session, not to the subagent that spawned them.

Secondary friction in the same run:
- The main agent ran `tail -c 3000` on the orchestrator's `.output` file (main L41). That file is a symlink to the raw subagent JSONL (main L52 `ls` shows `a4d2f969a8f51a83f.output -> .../subagents/agent-a4d2f969a8f51a83f.jsonl`), so it printed base64 blobs. The Agent tool result had warned "Do NOT Read or tail this file via the shell tool" (orchestrator L14).
- The final `ReportFindings` call failed schema validation: `short_summary` has a 60-character maximum (main L101 `"Too big: expected string to have <=60 characters"`, for findings 0, 2, 6 ...). The model had to shorten the summaries and retry (L109).

## Symptom
- Main L25: task-notification `<status>completed</status>` ... `<result>Still waiting on the line-by-line finder (Angle A); then I'll dedup and verify.</result>`
- Main L36: "The `/code-review` run is still in progress in the background ... I'll relay the results when the final notification arrives."
- Main L48 USER: "it's been a very long time, check that it's still alive"
- Main L74: "The review orchestrator had stalled: all five finder agents finished by 12:14 UTC, but it ended its turn "waiting on Angle A" and never resumed — 75 minutes of nothing."

## Timeline
- Orchestrator L13-22: launches 5 background finders (A line-by-line, B removed-behavior, C cross-file, Reuse/Simplification/Efficiency, Altitude/Conventions).
- Orchestrator L26-42: "Angle B is in", "Two finders done", "Four finders done; waiting on the Altitude/Conventions finder".
- Angle A L43: final JSON array (6 candidates) as its last assistant message. It does not arrive at the orchestrator.
- Orchestrator L45: "Still waiting on ... Angle A". Its turn ends, so a notification goes to the main session.
- Orchestrator L48-51: `ToolSearch select:SendMessage,ReportFindings`, then `SendMessage` to A: "Your completion notification did not reach me."
- Angle A L47: `SendMessage to: "code-review"`. Result: "Message queued for delivery to code-review at its next tool round."
- Main L25/L36/L44: the main agent reports "still running" twice.
- Main L51-57: the main agent inspects the tasks dir. Its python one-liner, which JSON-parses the last line of each `.output`, fails with `JSONDecodeError`.
- Main L71: `SendMessage to aee7cc11cc58331de`: "all five finder agents (including Angle A) completed by 12:14 UTC ... continue dedup + verify".
- Main L78: Angle A's completion notification is delivered to the **main** session.
- Main L97-110: the orchestrator finishes. `ReportFindings` fails on the 60-character limit and succeeds on retry: "9 findings reported."

## Root cause
- Background-agent completion notifications appear to be delivered to the root conversation, not to the (sub)agent that called `Agent`. An orchestrator subagent that waits for "you will be notified automatically" can wait forever. The Agent tool text ("You will be notified automatically when it completes") is only true for the root.
- A subagent that ends its turn while "waiting" produces a `completed` notification whose body says "still waiting". The status and the text contradict each other, and nothing schedules a resume.
- `ReportFindings.short_summary` has a hidden 60-character cap that the /code-review instructions do not mention. Findings are naturally longer.

## Why agents fall for it
The Agent tool result promises automatic notification, and the orchestrator has no other signal. The root agent sees `completed` plus "still waiting" and trusts the prose. Neither agent has a timeout or a heartbeat.

## Current state
Unknown/likely open: this is Claude Code harness behaviour (version 2.1.238 in the transcript metadata), not repo code. No CLAUDE.md or memory entry mentions it. Existing related file: chris.claude.code-review-no-target-reviews-head-commit.md (a different /code-review quirk).

## Suggested fix
- Harness: deliver a background subagent's completion notification to the agent that spawned it. Or refuse `run_in_background` for agents launched from a subagent, and make the orchestrator block on them.
- /code-review skill: run finders in the foreground, or make the orchestrator poll `.output` files and stop when all finders are done. Tell finders to return results only as their final message, not through SendMessage.
- When a subagent's turn ends with pending-work prose, the root should get a status other than `completed` (e.g. `idle-waiting`).
- Put `short_summary <= 60 chars` in the ReportFindings instructions, or truncate server-side.

## Detection signal
- Notification `<status>completed</status>` whose `<result>` matches /still waiting|waiting on|will (dedup|continue)/i.
- A subagent transcript containing "notification did not reach me".
- A root-session notification for an agentId that the root never launched (a grandchild).
- A long wall-clock gap after a subagent's "waiting" message.
- `InputValidationError ... short_summary ... <=60 characters` on ReportFindings.

## Raw excerpts
```
main L25 [USER] <task-notification> <task-id>aee7cc11cc58331de</task-id> ... <status>completed</status>
  <summary>Agent "/code-review" finished</summary>
  <note>A task-notification fires each time this agent stops with no live background children of its own. ...</note>
  <result>Still waiting on the line-by-line finder (Angle A); then I'll dedup and verify.</result>
main L52 [RESULT ERROR] Fri Aug 21 13:30:00 UTC 2026 ... a4d2f969a8f51a83f.output -> /Users/christruter/.claude/projects/.../subagents/agent-a4d2f969a8f51a83f.jsonl
  ... json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
orchestrator L50 [TOOL SendMessage] {"to": "a78c6410c75364840", "summary": "Resend your final JSON candidate list", "message": "Your completion notification did not reach me. ..."}
angleA L48 [RESULT] {"success":true,"message":"Message queued for delivery to code-review at its next tool round.", ...}
main L78 [USER] <task-notification> <task-id>a78c6410c75364840</task-id> ... <summary>Agent "Angle A line-by-line scan" finished</summary>
main L101 [RESULT ERROR] InputValidationError: ... "code": "too_big", "maximum": 60, ... "path": ["findings", 0, "short_summary"]
```
