---
title: Long Bash commands are auto-backgrounded -- including the agent's own "until ...; sleep" wait loops -- so agents poll output files, read half-written logs, spin on `true`, and lose track of which worktree a backgrounded `cd` ran in
slug: auto-backgrounded-bash-polling-and-cwd
kind: env-friction
impact: both
severity: medium
status: open
area: Claude Code Bash tool (auto-background, blocked foreground sleep, Monitor), long test runs (./bin/test-agent)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 642-1006, 1815-1906, 2349-2439
    date: 2026-08-21..24
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.78, misleading_signal: 0.69, user_correction: 0.15, codebase_trap: 0.76, flailing: 0.64, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 1471-1528
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.48, misleading_signal: 0.59, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.75, env_friction: 0.64}
---
## Summary
Every `./bin/test-agent` invocation (tens of seconds to minutes) came back as "Command running in background with ID
...". The agent then wrote `until grep -q "exited with code" <task>.output; do sleep 15; done; cat ...` to wait --
and that loop was *also* backgrounded, producing a second task to wait on. Plain `sleep 120; cat ...` was backgrounded
too. Consequences seen in one session:
1. Dozens of redundant wait tasks and `cat <output> 2>/dev/null || echo pending` polls returning empty.
2. Reading a log the backgrounded command was still writing: "Correction ... the full baseline is **3 errors
   without my test, 4 with it** ... I read a partial file." (L2427) -- a wrong interim claim sent to the user.
3. cwd semantics differ by mode: a foreground `cd /private/tmp/mb-bisect && ...` persists, a backgrounded one does
   not ("Session cwd remains ...; directory changes made by the backgrounded command do not apply"). During a bisect
   the agent could not tell which tree its runs used, killed three runs with TaskStop, and added `echo "at: $(git log
   --oneline -1)"` to every command (L1856-1897): "I fumbled the bisect mechanics -- background commands run from the
   session directory, not the bisect worktree".
4. In the subagent, after a Monitor was set ("Keep working -- do not poll or sleep"), the agent issued ~12 no-op
   `true` Bash calls to pass time (L1479-1527).
5. Result files for chained commands were empty (`two-master.log` 0 bytes) while the agent concluded things from
   the first half of a `A; cd other && B` background command (L891-969).

## Symptom
See excerpts. Repeated `[RESULT] Command running in background with ID: ...` for commands whose sole purpose was to
wait.

## Timeline
- L646/L647, L675/L676, L796/L797, L856/L857, L878/L879, L900/L901, L925/L926, L955/L956, L991/L992, L1005/L1006: wait loops and `sleep` auto-backgrounded.
- L1815-1906 bisect in `/private/tmp/mb-bisect` with cwd confusion; TaskStop x3.
- L2371-2427 partial-log read, retracted.

## Root cause
The harness backgrounds long commands and blocks foreground sleep, but gives no blocking "wait for task X" primitive
in the Bash tool; the agent's instinctive wait idioms are themselves treated as long commands. The cwd persistence
rule differs between foreground and backgrounded commands and is only mentioned in a trailing notice.

## Why agents fall for it
`until ...; do sleep; done` is the standard shell way to wait. Background completion notifications arrive
asynchronously, interleaved with the agent's own messages, so reading the output file "early" looks harmless.

## Current state
Open (harness behaviour). The Bash tool description now says "Foreground `sleep` is blocked; use Monitor with an
until-loop to wait on a condition", but the subagent that used Monitor still spun on `true`. Nothing in the metabase
CLAUDE.md tells agents how to run `test-agent` in this mode (e.g. always write to a log and wait for the
task-notification).

## Suggested fix
- Harness: a `wait_for_task(id)` tool or letting a pure wait loop block; include the effective cwd in every
  background task's notification and output file header.
- CLAUDE.md "Running Backend Tests": "test-agent runs are backgrounded; redirect to a log, then act only on the
  task-notification; never grep a log before its task has exited; put `cd <worktree> &&` inside every command when
  using multiple worktrees."

## Detection signal
- Two consecutive background task IDs where the second command is an `until grep -q "exited with code"` loop on
  the first.
- Consecutive `true` tool calls; TaskStop on test runs followed by a re-run with an `echo "at: $(git log ...)"`.
- Assistant text containing "I read a partial file" / "still running" corrections.

## Raw excerpts
```
L646 [TOOL Bash] until grep -q "exited with code" .../tasks/bh2jgglau.output 2>/dev/null; do sleep 15; done; cat .../tasks/bh2jgglau.output
L647 [RESULT] Command running in background with ID: be9ekzpnv. ...
L1005 [TOOL Bash] sleep 120; cat .../tasks/bi3f7ye55.output 2>/dev/null
L1006 [RESULT] Command running in background with ID: bea9vb5fb. ...
L1815 [RESULT] ... Session cwd remains /Users/christruter/workspace/metabase/metabase.fix-app-db-rollback-only; directory changes made by the backgrounded command do not apply to subsequent commands.
L1891 [ASSISTANT] I fumbled the bisect mechanics -- background commands run from the session directory, not the bisect worktree, so a few runs pointed at the wrong tree and I stopped them.
L2427 [ASSISTANT] Correction to what I just said: the full baseline is **3 errors without my test, 4 with it** -- so my test adds one, it doesn't double them. I read a partial file.
subagent L1478 [RESULT] Monitor started ... Keep working -- do not poll or sleep.
subagent L1479-1527 [TOOL Bash] true   (x12)
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
  lines: 650-735, 858-860
  date: 2026-09-08
  jev: {self_inflicted_bug: 0.67, tool_misuse: 0.91, misleading_signal: 0.73, user_correction: 0.93, codebase_trap: 0.69, flailing: 0.38, env_friction: 0.82}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/1212e408-9c8b-4bb3-b9cd-ae892dec51bf.jsonl
  lines: 258-262, 1071
  date: 2026-09-17 (approx)
  jev: {self_inflicted_bug: 0.22, tool_misuse: 0.94, misleading_signal: 0.77, user_correction: 0.95, codebase_trap: 0.46, flailing: 0.73, env_friction: 0.94}

Polling roborev by parsing `roborev list`'s human table. 40cd8c33 L650 and L715: backgrounded wait loops ran
`roborev list --limit 40 | awk -v j=$j '$1==j {print $NF}'` and matched `done|failed|cancelled`. `$NF` is the Time
column (`3m12s...`), not Status, so the loops could never finish. The user had to say "i think more roborev reviews
finished" (L729); L735: "my poller's status parsing is broken (it reads the elapsed-time column, not status), so it'll
never terminate." A later stale poller fired a task-notification 40 minutes on (L858-860). The agent's own spelling
`cancelled` also didn't match roborev's `canceled` (fixed in the second loop). 1212e408 L258-259: `sleep 150; ... roborev
list` was blocked ("To wait for a condition, use Monitor with an until-loop"), and the replacement parsed
`awk 'NR==2{print $5}'` from the table (fragile: row 2 is whatever job is newest, and a queued row has an empty Time
column, shifting fields). Both sessions had better tools available: `roborev wait <job...>` blocks on several jobs
and exits with the verdict, and `roborev list --json`/`--status` gives machine-readable state (confirmed via
`roborev list --help`, `roborev wait --help`). Neither is mentioned in the roborev memory notes.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
  lines: 1327-1360
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/83b14905-733c-4844-8ea9-7f3fb00a3cb9.jsonl
  lines: 341-393
  date: 2026-09-16
  jev: {self_inflicted_bug: 0.96, tool_misuse: 0.81, misleading_signal: 0.63, user_correction: 0.43, codebase_trap: 0.75, flailing: 0.46, env_friction: 0.91}

1. **`nohup … &` detaches from the harness (kondo-ratchets L1328-1340).** `nohup ~/bin/ci-retry 81033 > /tmp/ci-retry-81033.log 2>&1 &` came back as "Command running in background with ID: b4uu3mizo ... You will be notified when it completes". The harness backgrounded the wrapper shell, which exits at once, so no notification about ci-retry itself ever arrives. "The `nohup … &` detached them from the harness. Let me check they're alive and launch the rest the tracked way". After that, two watchers were visible only through `/tmp/*.log` and `pgrep`, and two were harness-tracked. The agent had to remember which was which.
2. **A chained `commit; push | tail -1; roborev ...` got auto-backgrounded, and its tail hid a push failure (boost L341-365).** The 120 s timeout moved the command to the background. The agent's `sleep 45; cat …` was blocked ("Blocked: sleep 45 followed by: ... use Monitor with an until-loop"). The output eventually read `and the repository exists.`, the last line of a git push error cut by `| tail -1`. The agent retried the push (it worked) and later told the user "The first push attempt failed, and a retry went through". When the user said "retry push", the result was "Everything up-to-date". There was no data loss; the cost was a round trip plus a confusing status. Detection: `git push ... | tail -1` inside a compound command, or any `| tail -N` on a command whose failure text is multi-line.
