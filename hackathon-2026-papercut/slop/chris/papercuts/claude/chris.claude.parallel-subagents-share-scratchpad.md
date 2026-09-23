---
title: Parallel subagents share one scratchpad directory and one worktree; they read and clobber each other's working files and edit each other's batches
slug: parallel-subagents-share-scratchpad
kind: env-friction
impact: both
severity: high
status: open
area: Claude Code Agent tool (session scratchpad inherited by subagents), multi-agent batch refactors in one git worktree
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl
    lines: 275-440
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.73, tool_misuse: 0.69, misleading_signal: 0.89, user_correction: 0.13, codebase_trap: 0.82, flailing: 0.57, env_friction: 0.94}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-adc0757a6d63f0c93.jsonl
    lines: 123-145
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.89, misleading_signal: 0.91, user_correction: 0.74, codebase_trap: 0.88, flailing: 0.55, env_friction: 0.88}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-ad334f260d4e69004.jsonl
    lines: 320-380
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.82, misleading_signal: 0.69, user_correction: 0.76, codebase_trap: 0.89, flailing: 0.76, env_friction: 0.89}
---
## Summary
The coordinator split ~310 lint sites into four batches (A-D) and launched four background subagents in the same worktree, each told to write intermediate files to the session scratchpad. The scratchpad path is the parent session's, so all four agents share it. Agents picked the same obvious filenames (`sites.txt`, `lint-before.txt`). Batch A read another batch's `sites.txt` and mechanically converted ~56 sites in 23 files belonging to batch D, without the thread analysis, `original-fn` handling, or require checks. Batch C's `lint-before.txt` was overwritten by a sibling, which (together with a zsh bug) made C think its kondo cache was corrupt. Because all agents also lint and test the same worktree, each agent's "clean lint" and test runs include others' half-finished edits.

## Symptom
- Parent L342: "Batch A is done, but it reports a real problem: it read another agent's site list out of the shared scratchpad and mechanically converted ~56 sites across 23 files that belong to another batch."
- Subagent C L123: "My `sites.txt` came out wrong — it lists 57 warnings in files I never linted (athena, bigquery, transforms/jobs_test)".
- Subagent C L139: "**`lint-before.txt` was clobbered by a sibling agent.** It contains athena/bigquery/transforms warnings — other batches' files — and zero mentions of mine. The scratchpad is shared with the parallel agents, and we both picked the same obvious filename."
- Subagent D L343/L368: found its files already rewritten; "`calculation_test.cljc` *was* in fact touched (it was converted to a broken `mt/` call)".
- Coordinator then sent several warnings that turned out to be false alarms because files were mid-edit (L383-392, L537-558), each needing a retraction message.

## Timeline
- L256: coordinator snapshots `.clj-kondo/.cache` to `$S/warm-cache` (shared).
- L278-L284: four `Agent` launches, prompts reference the same `$S` scratchpad; each says "Do NOT cd elsewhere ... do NOT run any git command that changes state".
- L340-342: batch A's report reveals cross-batch conversion.
- L345-361: coordinator checks every batch-D file: "every batch-D `.clj` file is already modified with new conversions".
- L362-368: SendMessage warnings to B, C, D.
- L383-392: coordinator retracts its "missing require" warning to D (file was mid-edit).
- L537-558: second false alarm to C (grepped `mt/` in docstrings) and retraction.

## Root cause
- Claude Code gives subagents the parent session's scratchpad path, with no per-agent subdirectory, and the prompts just said "scratchpad". Obvious names collide.
- One shared worktree for four concurrent writers: no isolation (the Agent tool's `isolation: "worktree"` was not used), so file ownership is by convention only.
- A mechanical converter script that reads "the site list" from a well-known path will happily read another agent's list.

## Why agents fall for it
Each subagent believes the scratchpad is private (the system prompt calls it "session-specific, isolated"). Nothing signals that siblings exist or share it. The coordinator's prompt design (same dir, generic filenames) makes collisions likely.

## Current state
Harness behaviour; still the case (this drill's own subagent scratchpad is the parent's `scratchpad/pc`). No memory or CLAUDE.md note about giving each parallel subagent its own subdirectory or worktree.

## Suggested fix
- Harness: give each subagent `<scratchpad>/agents/<agent-id>/` by default, or state in the subagent system prompt that the scratchpad is shared with sibling agents.
- Coordinator habit (memory/CLAUDE.md): give each parallel agent a unique subdir and file prefix (`batchC-sites.txt`), and use `isolation: "worktree"` for parallel editors, merging results afterwards; or partition by files and forbid touching files outside the list.
- Converter scripts should take the file list as an explicit argument and refuse to edit files not in it.

## Detection signal
- Two or more concurrent Agent launches whose prompts share a write directory and do not set `isolation`.
- An agent reporting data about files outside its assigned list; `git status` showing modified files outside a batch's list during the batch.
- Subagent saying "clobbered", "files I never linted", "not mine".

## Raw excerpts
```
L342 [ASSISTANT] Batch A is done, but it reports a real problem: it read another agent's site list out of the shared scratchpad and mechanically converted ~56 sites across 23 files that belong to another batch. Those files are almost certainly batch D's (23 files, ~57 sites). The danger isn't the rewrite itself — it's that those sites were converted without any thread-crossing analysis, `original-fn` handling, or `mt` require check, and the owning agent's lint will now show them as clean and skip them.
```
```
(subagent C) L139 [ASSISTANT] Both mysteries are now explained, and neither is a real problem:
1. **The zero-warning re-runs were a zsh bug.** `--lint $FILES` — zsh doesn't word-split unquoted expansions, so the entire list was passed as one filename (`...test/util.clj:0:0: error: file does not exist`). My first run listed files literally, which is why it worked.
2. **`lint-before.txt` was clobbered by a sibling agent.** It contains athena/bigquery/transforms warnings — other batches' files — and zero mentions of mine. The scratchpad is shared with the parallel agents, and we both picked the same obvious filename.
```
