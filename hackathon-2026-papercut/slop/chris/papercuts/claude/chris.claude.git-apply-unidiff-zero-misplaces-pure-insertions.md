---
title: Applying a hand-selected subset of hunks with `git apply --unidiff-zero` put pure-insertion hunks in the wrong place and broke a kondo hook
slug: git-apply-unidiff-zero-misplaces-pure-insertions
kind: tool-quirk
impact: introduced-bug
severity: medium
status: documented-still-hit
area: git apply -U0 / --unidiff-zero, scripted hunk selection
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 917-1035
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.82, user_correction: 0.11, codebase_trap: 0.56, flailing: 0.55, env_friction: 0.92}
---
## Summary
The user wanted codex's docstring/comment rewording kept on a follow-up branch, separate from the tightened PR. The agent generated zero-context diffs, selected the 45 "prose" hunks with a script, and applied them in a new worktree with `git apply --unidiff-zero`. First attempt: the script kept wrong file paths in headers, so git applied the patch as a rename into a `private/` directory (L930-945). Second attempt applied "cleanly across 10 files (+101/−81)" but, with zero context, pure-insertion hunks (no removed lines to anchor on) landed at the wrong line numbers once earlier hunks shifted the file, which broke the hook `.clj-kondo/src/hooks/common/modules.clj`. Tests in the follow-up worktree caught it (L996). Three insertions were moved by hand (L1011-1017).

## Symptom
L930 THINKING: "`git diff --stat` shows 10 files losing all their lines, including db_ns_test, which isn't even part of the patch." L996: "two pure-insertion hunks got misplaced by `--unidiff-zero` in the follow-up worktree, breaking the hook". L1011: "I need to move three misplaced pure-insertion hunks: the `module-friends` docstring, the vector comment in the hook, and the `kondo-config-diff` docstring—since only these could land wrong (replacement hunks check old lines first)."

## Root cause
With `-U0`, a hunk that only adds lines carries no context and no removed lines, so git places it purely by line number. When a subset of hunks is applied, the line numbers in the remaining hunks no longer correspond to the target file.

## Why agents fall for it
`git apply` reports success; `--check` passes. The failure is semantic (a docstring inserted into the wrong function) and only shows in tests or careful reading.

## Current state
Memory now documents it: MEMORY.md "[git apply -U0 insertion trap](reference_git_apply_unidiff_zero_insertions.md) — subset misplaces pure insertions" (created in this session, L1035). Git behaviour unchanged.

## Suggested fix
Prefer `git diff -U3` + `git apply --3way` or `git checkout -p`-style selection with context, or apply prose changes with the Edit tool / rewrite-clj. If `-U0` is unavoidable, recompute line numbers per hunk against the target file.

## Detection signal
`git apply --unidiff-zero` (or `-U0` diff piped to apply) in a transcript, especially after a script filters hunks.
