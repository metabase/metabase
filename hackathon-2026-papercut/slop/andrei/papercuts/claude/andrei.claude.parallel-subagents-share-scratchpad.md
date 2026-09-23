---
title: Three parallel subagents of one session each wrote their mutation-testing harness to the shared scratchpad as `mutate.py`, so one found a sibling's script in place of its own and another executed a sibling's harness believing it was its own
slug: parallel-subagents-share-scratchpad
kind: env-friction
impact: wasted-time
severity: medium
status: open
area: Claude Code session scratchpad shared by concurrent subagents (<scratchpad>/mutate.py and other generically named working files)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/31c858da-b01f-4914-87ef-7f7df04bd7c0/subagents/agent-a26424f0417d4520b.jsonl
    lines: 469-487
    date: 2026-09-14
    jev: {any_papercut: 0.83, env_toolchain: 0.91, stale_state: 0.30, verify_mismatch: 0.34, misleading_code: 0.29, hidden_coupling: 0.77, stale_docs: 0.29, tool_footgun: 0.75, flaky: 0.65, agent_bug: 0.80, wasted_effort: 0.56, user_correction: 0.28}
---
## Summary
The lead session ran about a dozen implementer and reviewer subagents in parallel, all writing into the same session scratchpad. Three of them named their mutation-testing harness `mutate.py`. One fix agent went to derive a new harness from its `mutate.py` and found another agent's script there; later a third agent piped its mutations into `mutate.py` and ran a sibling reviewer's harness, which crashed only because it expected a path argument it would otherwise have mutated.

## Symptom
L469-L470 the fix agent's `python3 - <<EOF` that rewrites `$S/mutate.py` into `mutate_pivot.py` fails with `ValueError: substring not found`, then `can't open file '<scratchpad>/mutate_pivot.py'`. L473-L474 `sed -n '1,8p' $S/mutate.py` shows someone else's script (`def mutate(path, old, new, tests)`). L478 it lists the crowded scratchpad and L483-L487 moves its whole working set into `<scratchpad>/<task>-fixes/` and rebuilds its build state. In agent-a4cd3d422803f3408 L528-L529 a third agent runs `uv run python <scratchpad>/mutate.py` and gets `IndexError` at `ROOT = pathlib.Path(sys.argv[1])`: agent-a8d588e244f4b13cc had written its own harness there at L271.

## Timeline
- 12:56:54 L469-L470 the fix agent's harness derivation fails on a file it did not write.
- 12:57 L473-L483 inspects the file and the scratchpad, relocates into a private subdirectory and rebuilds its build state.
- 14:00:06 agent-a8d588e244f4b13cc L271 writes its own `<scratchpad>/mutate.py` (a runner that edits files under the path argument it is given).
- 14:47:15 agent-a4cd3d422803f3408 L528-L529 runs that file as its own harness; IndexError.
- 14:47:35 L532-L536 reads the foreign file and writes `<task>-fixes/mutate_<task>.py` instead.
- Cost: a lost round for two agents; had the third agent passed a path, the foreign harness would have mutated files in the wrong checkout.

## Root cause
Subagents inherit the parent's scratchpad and nothing namespaces it per agent. Agents doing similar work pick the same obvious file names. Unknown: whether a shared per-session scratchpad is intended.

## Why agents fall for it
Each subagent is told to use the scratchpad and assumes it is private. Names like `mutate.py`, `scan.py` or `report-draft.md` are the natural choice for every agent doing the same kind of task, and a file with the expected name looks like the agent's own until its content is read.

## Current state
Not checked beyond the transcripts; later in the same session agents defensively create per-task subdirectories (`<task>-fixes/`, `lensB/`).

## Suggested fix
- Give each subagent its own scratchpad subdirectory (e.g. `<scratchpad>/<agent-id>/`) and name it in the subagent's environment block.
- Until then, have orchestrator prompts assign each subagent a unique subdirectory.
- Warn when a subagent writes or executes a scratchpad file last written by a different agent.

## Detection signal
A subagent executing or editing a scratchpad file whose last Write came from another transcript; errors such as `substring not found` or `IndexError` right after reading `$SCRATCH/<generic>.py`; `mkdir -p $SCRATCH/<agent-specific>` immediately after.

## Raw excerpts
```
L469 [CALL] cd <checkout> && S=<scratchpad> && cp <source file> $S/<source file>.pivot && python3 - <<'EOF' ... m=open(f'{S}/mutate.py').read() ...
L470 [RESULT] Traceback (most recent call last): File "<stdin>", line 4, in <module> ValueError: substring not found ... can't open file '<scratchpad>/mutate_pivot.py': [Errno 2] No such file or directory
L473 [CALL] S=<scratchpad> && sed -n '1,8p' $S/mutate.py && /usr/bin/grep -n "^}" $S/mutate.py
L474 [RESULT (ERROR)] Exit code 1 import subprocess, sys from pathlib import Path  def mutate(path, old, new, tests):     p = Path(path) ...
L478 [CALL] S=<scratchpad> && ls -la $S | head -60
L483 [CALL] S=<scratchpad> && B=$S/<task>-fixes && mkdir -p $B && ... for f in <working files and build state dirs> ... do mv ...
(agent-a8d588e244f4b13cc) L271 [CALL] Write <scratchpad>/mutate.py: '"""Apply one mutation at a time to the scratch worktree, run the <test selection>, restore.""" ... ROOT = pathlib.Path(sys.argv[1]) ...'
(agent-a4cd3d422803f3408) L528 [CALL] cd <checkout> && cat <<'EOF' | uv run python <scratchpad>/mutate.py ("<file>", '<original line>' ...
(agent-a4cd3d422803f3408) L529 [RESULT] Traceback (most recent call last): File "<scratchpad>/mutate.py", line 7, in <module>     ROOT = pathlib.Path(sys.argv[1]) IndexError: list index out of range
(agent-a4cd3d422803f3408) L536 [CALL] SP=<scratchpad> && mkdir -p $SP/<task>-fixes && cat > $SP/<task>-fixes/mutate_<task>.py <<'EOF' ...
```
