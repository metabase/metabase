---
title: In a worktree-isolated session the guard refused six git-free commands, a `for` loop of `sed | grep` over source files and Python heredocs that read or wrote scratchpad files among them, as "too complex to verify that it stays inside the worktree"
slug: worktree-isolation-guard-refuses-heredoc-redirects
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: Claude Code worktree isolation guard (after EnterWorktree); Bash commands with loops, heredocs, redirects and `$(...)`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/48227924-deda-48c6-a33c-119c357a9097.jsonl
    lines: 130-468
    date: 2026-09-01
    jev: {any_papercut: 0.80, env_toolchain: 0.85, stale_state: 0.13, verify_mismatch: 0.11, misleading_code: 0.22, hidden_coupling: 0.52, stale_docs: 0.62, tool_footgun: 0.70, flaky: 0.31, agent_bug: 0.33, wasted_effort: 0.72, user_correction: 0.93}
---
## Summary
After `EnterWorktree`, every Bash command in the session passes a guard meant to keep git operations inside the worktree. It refused commands that contained no git at all whenever they used loops, heredocs, redirects or command substitution, with a message about git operations. The agent had to split commands or save throwaway scripts with the Write tool and run those instead, six times in the session.

## Symptom
L275 refusal of `for f in <adapter names>; do echo "=== $f ==="; sed -n "/(def supported-models/,.../p" src/metabase/metabot/self/$f.clj | grep -oE ...; done`; L318 refusal of `python3 - <<'EOF'` reading a scratchpad JSON; L465 refusal of `python3 - <<'PYEOF' > <scratchpad>/table.edn`; L131 and L135 refusals of a `$(grep ... | cut ...)` plus `curl` loop. Each result: 'This session is isolated in the worktree ..., but this command is too complex to verify that it stays inside the worktree. Refusing to run it – a worktree-isolated session's git operations must target its own worktree.'

## Timeline
- 14:38:40-14:38:47 L130-L135 two refusals of a git-free `$(...)` plus `curl` loop; the agent changed approach.
- 14:43:17 L274-L275 source-scanning loop refused; L278 rewritten as a Python heredoc, which was allowed.
- 14:44:51 L317-L318 heredoc reading a scratchpad file refused; L321-L322 saved as `resolve_prices.py` with Write and run.
- 14:51:01 L458-L465 heredoc with a `>` redirect into the scratchpad refused; L468 saved as `gen_table.py`.
- 17:01 one more refusal later in the session (L947).
- Cost: six refusals and four rewrites into scratch scripts.

## Root cause
The guard refuses whenever it cannot statically prove where a compound command writes, even with no git or gh invocation in it. Unknown: the exact rule; a heredoc without a redirect (L278) passed.

## Why agents fall for it
The refusal text talks about git, so the agent cannot tell which part of a plain loop or heredoc is objectionable, and the same shapes run fine outside isolated sessions.

## Current state
Not checked.

## Suggested fix
- Apply the check only to commands that invoke git (or gh), or skip it when no git token is present.
- Name the construct the guard could not verify (loop, redirect, substitution) and suggest the smallest rewrite.

## Detection signal
Tool error containing 'too complex to verify that it stays inside the worktree' on a command with no `git` token.

## Raw excerpts
```
L274 [CALL] for f in <adapter names>; do echo "=== $f ==="; sed -n "/(def supported-models/,/^\(   \)\?$/p" src/metabase/metabot/self/$f.clj | grep -oE '"[^"]+"\s+\{' | grep -oE '^"[^"]+"'; done
L275 [RESULT (ERROR)] This session is isolated in the worktree ~/src/mb/wt/<branch>, but this command is too complex to verify that it stays inside the worktree. Refusing to run it – a worktree-isolated session's git operations must target its own worktree. Split it into plain, separate commands and run them from ~/src/mb/wt/<branch>.
L278 [CALL] python3 - <<'EOF' import re, json adapters = {} for name in [<adapter names>]:     src = open(f"src/metabase/metabot/self/{name}.clj").read() ...
L317 [CALL] python3 - <<'EOF' import json d = json.load(open('<scratchpad>/litellm_prices.json')) ...
L318 [RESULT (ERROR)] This session is isolated in the worktree ~/src/mb/wt/<branch>, but this command is too complex to verify that it stays inside the worktree. Refusing to run it ...
L321 [CALL] Write <scratchpad>/resolve_prices.py
L458 [CALL] python3 - <<'PYEOF' > <scratchpad>/table.edn import json, os ...
L465 [RESULT (ERROR)] This session is isolated in the worktree ~/src/mb/wt/<branch>, but this command is too complex to verify that it stays inside the worktree. ...
L468 [CALL] Write <scratchpad>/gen_table.py
```
