---
title: In the zsh Bash tool, `while read -r path ...` overwrites $PATH (zsh ties `path` to PATH), so later commands in the loop are "not found" and `2>/dev/null` turns that into plausible empty results
slug: zsh-path-variable-clobbers-path
kind: env-friction
impact: both
severity: high
status: open
area: Claude Code Bash tool on macOS (commands run in zsh); any shell loop that names a variable `path`
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-dynamic-require-lints/e6b23baa-5f60-44a8-8556-c6dc922330e9.jsonl
    lines: 73-148
    date: 2026-09-01
    jev: {self_inflicted_bug: 0.27, tool_misuse: 0.97, misleading_signal: 0.93, user_correction: 0.63, codebase_trap: 0.52, flailing: 0.76, env_friction: 0.95}
---
## Summary
zsh ties the lowercase array `path` to `PATH`.
A bash-style loop such as `while IFS=$'\t' read -r path branch dirty ...; do ... done < survey.tsv` sets `path` to the first column of each row.
That replaces PATH with a worktree directory.
Every external command inside the loop body then fails with `zsh: command not found: cut` (or `paste`, `git`, ...).
`grep` keeps working, because in the Claude Code shell it is a function that calls the claude binary by absolute path, so the breakage looks partial and odd.
When the loop hides stderr (`git diff --shortstat ... 2>/dev/null`), there is no error at all: every row gets the fallback value.
In this session that meant **every one of ~75 worktrees was reported as having an empty diff against master**.

## Symptom
- First run (L73-74): dozens of `zsh: command not found: paste` / `cut` lines.
- Second run (L128-129): the loop printed `EMPTY-DIFF` for every worktree, including branches 90 commits ahead. With stderr silenced, that output looked like a real (surprising) result.
- The agent twice misdiagnosed this as "The join lost PATH in subshells" (L77) and "The subshell PATH issue again" (L140). Both times it worked around it by moving the loop into a `#!/bin/bash` script, where `path` is an ordinary variable. It never found the cause.

## Timeline
- L73: `while IFS=$'\t' read -r path branch dirty date ahead merged head; do pr=$(grep -P ... | cut -f2- | paste -sd' | ' -) ...` → L74 `zsh: command not found: paste` ×N.
- L77: "The join lost PATH in subshells. Redoing it with awk:". The agent switched to awk and dropped the loop.
- L128: `while IFS=$'\t' read -r path branch dirty date ahead merged head; do ... st=$(git diff --shortstat origin/master...$head 2>/dev/null); printf ... "${st:-EMPTY-DIFF}"` → L129 every row `EMPTY-DIFF`.
- L132: "The diff check silently failed — debugging:". `cat -A` fails (BSD cat). A direct `git diff --shortstat` outside the loop works (`15 files changed ...`).
- L140: "The subshell PATH issue again. Rerunning without a trailing pipe:". The loop is moved to `diffcheck.sh` and run with `bash`, and it works: only 5 worktrees have an empty diff.
- Without the stderr check, the survey would have marked every worktree as safe to delete.

## Root cause
zsh special parameters: `path` (array) ⇄ `PATH` (scalar), and likewise `cdpath`, `fpath`, `manpath`, `module_path`.
Assigning `path=<string>` sets PATH to that one directory.
The Bash tool runs commands in the user's zsh (via the shell snapshot), but agents write bash.
Using `path` as a loop variable name is idiomatic and harmless in bash.

## Why agents fall for it
- `path` is the most natural name for the first column of `git worktree list` output.
- The failure only shows up inside the loop body. Commands before and after the loop work, which points toward "subshell" theories.
- `grep` still works because of the Claude Code grep shim (absolute path to the binary), so "PATH is gone" is not the obvious conclusion.
- With `2>/dev/null` plus a `${x:-DEFAULT}` fallback, the failure turns into a valid-looking answer.

## Current state
Reproduced in the current environment (2026-09-23):
```
$ printf 'a\tb\n' | while IFS=$'\t' read -r path x; do echo "PATH=$PATH"; cut -f1 <<< "x"; done
PATH=a
zsh: command not found: cut
```
Nothing documents it. `chris.claude.zsh-and-bsd-shell-quirks.md` covers `=`-expansion, NOMATCH, word splitting and BSD flags, but not the special parameters.

## Suggested fix
- In a PreToolUse Bash hook, warn on `read [-r] ... \bpath\b`, `for path in`, or `path=` in a command run under zsh. The advice would be to rename the variable to `p`/`wt`, or to run the command with `bash -c`.
- Add a line to the global CLAUDE.md shell notes: "The Bash tool is zsh: never name a variable `path` (it is PATH), and do not rely on word-splitting."
- More generally, write multi-line loops as `bash <<'EOF' ... EOF` scripts.

## Detection signal
- In a tool result, several `zsh: command not found: <coreutil>` lines where the coreutil is a standard binary (cut, paste, sort, git, awk).
- In a tool call: `read` / `for` binding `path`, `cdpath`, `fpath` or `manpath` while running in zsh.
- A loop result where every row carries the fallback value (e.g. all `EMPTY-DIFF`) and stderr was silenced.

## Raw excerpts
```
L73 [TOOL Bash] ...
while IFS=$'\t' read -r path branch dirty date ahead merged head; do
  pr=$(grep -P <REDACTED> $SP/allpr.tsv | cut -f2- | paste -sd' | ' - )
  printf '%s\t%s\t%s\tdirty=%s\tahead=%s\tinmaster=%s\t%s\n' "${path##*/metabase.}" "$branch" "$date" "$dirty" "$ahead" "$merged" "${pr:-—}"
done < $SP/survey.tsv | sort -t$'\t' -k3
L74 [RESULT] zsh: command not found: paste
zsh: command not found: cut
zsh: command not found: cut
...
L77 [ASSISTANT] The join lost PATH in subshells. Redoing it with awk:
```
```
L128 [TOOL Bash] while IFS=$'\t' read -r path branch dirty date ahead merged head; do
  [ "$dirty" = MISSING ] && continue
  st=$(git diff --shortstat origin/master...$head 2>/dev/null)
  printf '%s\t%s\t%s\n' "${path##*/metabase.}" "$branch" "${st:-EMPTY-DIFF}"
done < $SP/survey.tsv | grep -E 'EMPTY-DIFF'
L129 [RESULT] /Users/christruter/workspace/metabase/metabase	master	EMPTY-DIFF
... (every worktree) ...
beguild-30-ratchet-policy	beguild-30-ratchet-policy	EMPTY- …
L140 [ASSISTANT] The subshell PATH issue again. Rerunning without a trailing pipe:
L148 [RESULT] === NO DIFF VS MASTER === (5 rows)
```
