---
title: The post-Edit formatter hook reindented all of src/metabase/util/log.clj (macros/case forms), inflating a 32-line change to 83 lines of diff
slug: edit-hook-reindents-log-clj-case-macros
kind: tool-quirk
impact: wasted-time
severity: low
status: documented-still-hit
area: Claude Code post-Edit hook (cljfmt), src/metabase/util/log.clj, :style/indent macros
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 837-874
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.82, user_correction: 0.11, codebase_trap: 0.56, flailing: 0.55, env_friction: 0.92}
---
## Summary
While tightening PR #82301 after the user complained about an inflated diff, the agent edited the resolver block in `src/metabase/util/log.clj` with the Edit tool. The Edit hook re-formatted the whole file, and `git diff --stat` showed log.clj at 83 changed lines, mostly `macros/case` reindentation that disagrees with the repo's cljfmt config. The agent had to restore log.clj from the merge base with a babashka splice script (avoiding the Edit tool so the hook wouldn't fire again), which itself first failed on a zsh `$B:src` modifier. Final: +32/-13.

## Symptom
L837 THINKING: "check why log.clj shows an unexpectedly large 83-line diff—likely from the formatter hook." L852: "log.clj got reformatted by the edit hook, clashing with cljfmt's handling of `case` macros. I'll restore it from master via a script (to avoid retriggering the hook)". L862: `32 13 src/metabase/util/log.clj` and `grep -c 'macros/case'` -> 0.

## Root cause
The Edit hook formats whole files, and its indent rules for macros with `:style/indent` metadata (here `macros/case`) differ from what's committed. Any Edit to such a file produces unrelated whitespace churn.

## Why agents fall for it
The hook runs invisibly after a successful Edit ("file state is current in your context"). The churn only shows in `git diff --stat`, which agents check late, and it cuts directly against the user's tight-diff rule (memory `feedback_tight_pr_diffs.md`, written in this same session).

## Current state
Documented in memory: MEMORY.md "[Edit hook reindents :style/indent macros](reference_edit_hook_reindents_style_indent_macros.md) — edit via perl". The memory was written 2026-09-08 (modified timestamp), two days before this session, so it was loaded and still hit: the agent only recognised the churn after the diff stat, and the memory says "edit via perl" rather than preventing the Edit.

## Suggested fix
- Make the hook format only the changed region, or run `./bin/mage cljfmt-files` with the repo's config so results match CI.
- Alternatively have the hook skip files whose formatting it would change outside the edited lines, and print a warning.

## Detection signal
- After an Edit, `git diff -w --numstat` much smaller than `git diff --numstat` for the same file.
- Diff hunks touching only indentation of `macros/case` / `:style/indent` macro call sites.
