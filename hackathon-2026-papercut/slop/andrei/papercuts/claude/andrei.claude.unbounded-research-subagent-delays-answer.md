---
title: For a quick question about debugging a hung Metabot chat, the lead spawned an open-ended code-research subagent, then ended its turn with "Full ideas list coming once the agent reports" although it already had the answer, and the user waited 16 minutes before stopping it.
slug: unbounded-research-subagent-delays-answer
kind: agent-behaviour
impact: wasted-time
severity: medium
status: open
area: Agent tool (background general-purpose subagent), TaskStop, turn structure
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/0d6ec167-e630-480d-87af-30190e67cfae.jsonl
    lines: 80-251
    date: 2026-09-15
    jev: {any_papercut: 0.74, env_toolchain: 0.89, stale_state: 0.24, verify_mismatch: 0.07, misleading_code: 0.19, hidden_coupling: 0.23, stale_docs: 0.23, tool_footgun: 0.63, flaky: 0.75, agent_bug: 0.23, wasted_effort: 0.52, user_correction: 0.15}
---
## Summary
The user asked for ideas to debug a hung Metabot conversation. The lead launched a read-only research subagent with a broad brief and no time or tool budget, meanwhile found the key evidence itself, and then held its answer until the subagent reported. The subagent was still researching 21 minutes later; after the user pointed out the delay, the lead stopped it with TaskStop and delivered the answer two minutes after that.

## Symptom
- L213 (16:05): the lead ends its turn saying it is still waiting on the code research agent (timeouts, abort handling, log lines), that it already knows where the turn died, and that the full ideas list will come once the agent reports.
- L217 (16:21): the user points out that more than 20 minutes have passed while the subagent kept investigating.
- L235: `TaskStop` on the subagent; L251 (16:23): the answer.

## Timeline
- L6 (15:58): question.
- L80 (16:00): subagent launched with a broad research brief.
- L81-212: the lead gathers evidence itself and finds where the turn died.
- L213 (16:05): ends the turn waiting on the subagent.
- L217 (16:21): the user flags the delay; L235 TaskStop; L251 (16:23) answer.
- Cost: about 16 minutes of the user waiting on an answer the lead already had.

## Root cause
Agent habit: treating a background subagent's report as a prerequisite for replying, with no time budget in the subagent brief and no partial answer.

## Why agents fall for it
Spawning a subagent is cheap and feels thorough; ending the turn looks like a natural wait point, and nothing reminds the lead that the user is blocked.

## Current state
Not applicable (behaviour).

## Suggested fix
- Give research subagents a time or tool-call budget in the brief.
- Answer with what is known and fold subagent findings in later; do not end a turn solely to wait on a subagent when the user asked a quick question.

## Detection signal
Assistant text such as "waiting on the ... agent" or "once the agent reports" at the end of a turn, followed by a user message about elapsed minutes or a TaskStop of a running subagent.

## Raw excerpts
```
L80 [CALL] Agent (general-purpose) Research Metabot conversation persistence/hangs: Read-only research in the Metabase monorepo at ~/src/mb/metabase. Do NOT edit files, commit, or run anything that changes state. [...]
L235 [CALL] TaskStop: {"task_id": "<subagent>"}
```
