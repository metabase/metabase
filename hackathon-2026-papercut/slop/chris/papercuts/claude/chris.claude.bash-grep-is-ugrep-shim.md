---
title: In the Bash tool, `grep` is a Claude Code shell function that runs embedded ugrep, so GNU/BSD BRE patterns like `^\+` fail with a ugrep syntax error
slug: bash-grep-is-ugrep-shim
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: Claude Code Bash tool shell snapshot (~/.claude/shell-snapshots/snapshot-zsh-*.sh, "Shadow find/grep with embedded bfs/ugrep")
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/3bdfd417-14a3-46c9-84f9-28a801ebd34e.jsonl
    lines: 340-344
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.69, misleading_signal: 0.67, user_correction: 0.93, codebase_trap: 0.42, flailing: 0.21, env_friction: 0.87}
---
## Summary
The Claude Code shell snapshot defines `function grep { ... ARGV0=ugrep "$_cc_bin" -G --ignore-files --hidden -I --exclude-dir=.git ... }`. Unless certain flags are present, every `grep` an agent types runs the embedded ugrep. ugrep's `-G` basic-regex parsing differs from BSD/GNU grep. The common `git diff | grep "^+"` / `grep "^\+"` idiom for added lines errors out:

```
ugrep: error: error at position 5
(?m)^+
     \___invalid syntax
```

Exit status is 2. In a pipeline with `| grep -i ... | head`, the error goes to stderr and the stage emits nothing, which reads as "no matches". The shim also adds `--ignore-files --hidden -I` by default, so `grep` behaves differently from what the agent believes it ran. (In a spot check on `.clj-kondo/` the gitignored files were still found, so `--ignore-files` didn't change results there. It may elsewhere.)

## Symptom
- ev2 L340: `git diff main...HEAD -- core/capture.py | grep -n "^\+" | grep -i "grade\|rubric_hash\|..."` -> the ugrep error above.
- ev2 L343: the agent retried with `grep "^+"`, which worked.
- Reproduced 2026-09-23 in this drill: `grep "^\+" file` -> same error, exit 2. `command grep "^\+" file` -> `+a`, exit 0.
- The drill agent also saw `ugrep: warning: test/metabase/core/kondo_ratchet_test.clj: No such file or directory` from a plain `grep -n`. The `ugrep:` prefix is the only visible sign of the shim.

## Timeline
- L340-341: error.
- L343-344: retry without the backslash succeeds. Cost: one round trip. No user impact.

## Root cause
Claude Code replaces `grep` with an embedded ugrep via a shell function in the snapshot (`snapshot-zsh-*.sh` around line 6658, "Shadow find/grep with embedded bfs/ugrep"). ugrep's BRE dialect treats `\+` differently (it compiles to `(?m)^+`, a quantifier with nothing to repeat).

## Why agents fall for it
`type grep` isn't something agents check. The model's priors are GNU/BSD grep, and `^\+` is a standard GNU BRE idiom for a literal leading `+` in diffs.

## Current state
Present in the current shell snapshot (`/Users/christruter/.claude/shell-snapshots/snapshot-zsh-1790171370673-wbar1y.sh`: `function grep {` ... `ARGV0=ugrep "$_cc_bin" -G --ignore-files --hidden -I ...`). Not documented in CLAUDE.md or memory.

## Suggested fix
- Harness: when the pattern fails to parse in ugrep's BRE, fall back to `command grep`, or translate `\+` in `-G` mode.
- Memory/CLAUDE.md note: "`grep` in the Bash tool is ugrep. Use `grep '^+'` (no backslash) or `command grep` for exact GNU/BSD semantics."

## Detection signal
Tool results beginning with `ugrep: error:`. Cheap to match in a transcript scanner.

## Raw excerpts
```
L340 [TOOL Bash] cd ~/workspace/metabase/evals.results-grades && git diff main...HEAD -- core/capture.py | grep -n "^\+" | grep -i "grade\|rubric_hash\|grader_sha\|schema_version\|metric_versions" | head -25
L341 [RESULT] ugrep: error: error at position 5
(?m)^+
     \___invalid syntax
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/72ee4b52-4213-4328-b91b-df0671210015.jsonl
  lines: 140-141
  date: ~2026-09-17
  jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.62, user_correction: 0.75, codebase_trap: 0.39, flailing: 0.43, env_friction: 0.95}

It is the same idiom: the agent listed the comment and docstring lines a squash commit added with `git show <sha> -- '*.clj' | grep -n -E '^\+.*(;;|...)' | grep -v '^\+\+\+'`.
```
L141 [RESULT] === added comment/docstring lines ===
ugrep: error: error at position 5
(?m)^+++
     \___invalid syntax
```
The agent then dumped the whole `git show` (28k chars), and the user interrupted (L157 "[Request interrupted by user]", L159 "just look at the squash commit, not the pr").

A related grep trap: the shim passes `-I`, which skips binary files. See `index-test-nul-bytes-hide-from-grep`. Because of `-I`, plain `grep` returns nothing on `test/metabase/search/appdb/index_test.clj`.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
  lines: 88-89
  date: 2026-09-02
  jev: {self_inflicted_bug: 0.80, tool_misuse: 0.93, misleading_signal: 0.84, user_correction: 0.21, codebase_trap: 0.79, flailing: 0.55, env_friction: 0.88}

The agent counted negative IDs with `git show $b:.../metabase.data.ts | grep -oE '",\s*(-?[0-9]+),' | grep -c -- '-'`. The shim's ugrep does not honour `--` before a pattern that starts with a dash, so it printed its usage banner ("ugrep: no search PATTERN specified ... ugrep -e "-PATTERN"") and exited 2. The count line came out as `0`, which read as "no negative ids". The agent moved on, and the real answer (the bundle ships -185…-199) turned up later at L142 through a different command.

**New facet, reproduced 2026-09-23 while drilling batch b4: `-I` silently skips text files that contain ANSI escape bytes.**
The shim always passes `-I` (skip binary files). ugrep classifies a source file containing a literal ESC (`\x1b`, e.g. `"[34m"` colour codes written with the raw byte) as binary, and returns **no output and exit 1**, the same as "no match":
```
$ grep -n "defn" ~/dotfiles/bin/bin/ci_common.clj; echo "exit=$?"
exit=1
$ command grep -n "defn" ~/dotfiles/bin/bin/ci_common.clj | head -1
Binary file /Users/christruter/dotfiles/bin/bin/ci_common.clj matches
$ command grep -anE "defn" ~/dotfiles/bin/bin/ci_common.clj | head -1
16:(defn sh
```
`ci_common.clj` (the library behind `~/bin/ci-failures` / `ci-retry`) has 20+ `defn`s, but a plain `grep` finds none of them. An agent inspecting the CI helper would conclude that the function it's looking for doesn't exist. Stdin also fails: `echo x | grep -c -- '-'` → ugrep usage error, exit 2 (reproduced).
Detection: `grep` with exit 1 and no output on a file that was just `cat`ed or Read successfully; any `grep ... -- '-...'`.
Fix: drop `-I` from the shim (or use `--binary-files=text`), and pass `--` through to ugrep as `-e`.
