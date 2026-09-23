---
title: A loop variable named `path` in the zsh Bash tool replaced $PATH, so `gh`, `jq` and `ls` inside a GitHub pagination loop all failed with command not found
slug: zsh-path-variable-clobbers-path
kind: env-friction
impact: wasted-time
severity: low
status: open
area: Bash tool zsh (`path` array tied to PATH), shell loops in review subagents
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/31c858da-b01f-4914-87ef-7f7df04bd7c0/subagents/agent-a3a9648ccc64e258d.jsonl
    lines: 41-46
    date: 2026-09-14
    jev: {any_papercut: 0.82, env_toolchain: 0.90, stale_state: 0.19, verify_mismatch: 0.11, misleading_code: 0.27, hidden_coupling: 0.44, stale_docs: 0.31, tool_footgun: 0.78, flaky: 0.24, agent_bug: 0.88, wasted_effort: 0.62, user_correction: 0.06}
---
## Summary
A review subagent paginated a public repository's commits API in a loop that split `label:file` pairs with `name=${f%%:*}; path=${f#*:}`. In zsh `path` is the array form of PATH, so the assignment replaced the command search path and every later command in the loop failed. The failure was loud here and the agent renamed the variables to `nm`/`fp` on the next try.

## Symptom
L42: `zsh: command not found: gh`, `zsh: command not found: jq` for every iteration, then `zsh: command not found: ls`, exit 127.

## Timeline
- 11:49:23 L41 loop with `path=${f#*:}` fetching commit pages with `gh api` and counting them with `jq`.
- L42 every `gh`/`jq` call fails, then `ls`.
- 11:49:38 L45-L46 same loop with `fp=`; all pages fetched.
- Cost: one retry and 15 seconds here; with `2>/dev/null` the same bug produces empty files instead of errors.

## Root cause
zsh ties the lowercase `path` array to `PATH` (likewise `fpath`, `cdpath`, `manpath`), so assigning `path` rewrites the search path for the rest of the shell.

## Why agents fall for it
`path` is the obvious name for a file path, and it is an ordinary variable in bash, which is what the tool's name suggests.

## Current state
Checked 2026-09-23 in the agent shell: `( for path in a; do :; done; echo $PATH )` prints `a` and `ls` is then not found.

## Suggested fix
- Run the Bash tool under bash, or tell agents that `path`, `fpath` and `cdpath` are reserved names in zsh.
- A pre-exec check in the tool could warn on `path=` assignments and `for path in` loops.

## Detection signal
`command not found` for basic tools (`ls`, `gh`, `jq`, `git`) in a command that assigns `path=` or loops `for path in`.

## Raw excerpts
```
L41 [CALL] A=<scratchpad>/A; cd $A for f in v2:<file-a> legacy:<file-b>; do   name=${f%%:*}; path=${f#*:}   for ref in main <sha>; do ... gh api "repos/<owner>/<repo>/commits?path=$path&sha=$ref&per_page=100&page=$page" > $tag-p$page.json      n=$(jq length $tag-p$page.json) ...
L42 [RESULT (ERROR)] Exit code 127 zsh: command not found: gh zsh: command not found: jq v2-main page 1:  zsh: command not found: gh zsh: command not found: jq v2-<sha> page 1:  ... zsh: command not found: ls
L45 [CALL] A=<scratchpad>/A; cd $A for f in v2:<file-a> legacy:<file-b>; do   nm=${f%%:*}; fp=${f#*:} ...
L46 [RESULT] v2-main page 1: 67 v2-<sha> page 1: 67 legacy-main page 1: 100 legacy-main page 2: 74 ...
```
