---
title: `git grep -n PATTERN -A 12 -- path` fails with 'fatal: unable to resolve revision: -A' because git grep stops parsing options at the pattern, and agents used to GNU grep keep putting options after the pattern
slug: git-grep-options-after-pattern
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: git grep
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a342a3a46659ac024.jsonl
    lines: 492-496
    date: 2026-09-17
    jev: {any_papercut: 0.85, env_toolchain: 0.74, stale_state: 0.36, verify_mismatch: 0.50, misleading_code: 0.43, hidden_coupling: 0.78, stale_docs: 0.29, tool_footgun: 0.74, flaky: 0.58, agent_bug: 0.91, wasted_effort: 0.69, user_correction: 0.08}
---
## Summary
Agents that use `git grep` in place of `grep` write it with GNU grep's option order. With `--`, the error is `unable to resolve revision: -A`, which reads like a git ref problem; without it, `option '-A' must come before non-option arguments`. The first part of the compound command prints normally, so the missing context lines are easy to overlook.

## Symptom
agent-a342 L395 `fatal: option '-A' must come before non-option arguments`; agent-a342 L493 and L613 `fatal: unable to resolve revision: -A`; agent-a632 L275 the same.

## Timeline
- agent-a342 L394-L398: context lookup fails; falls back to `sed -n`.
- agent-a342 L492-L496: same; falls back to `sed -n`.
- agent-a342 L612-L616: same.
- agent-a632 L274-L277: same; the agent edits without the lookup.
- Cost: four extra calls in the session.

## Root cause
git grep's option parser stops at the first non-option argument, so a later `-A` is taken as a revision (with `--`) or rejected. Both messages reproduced in a scratch repo today.

## Why agents fall for it
GNU grep permutes options, so `grep -n PAT -A 5 file` works, and git grep looks like a drop-in replacement.

## Current state
not checked (git behaviour; reproduced in a scratch repo).

## Suggested fix
- Put git grep options before the pattern: `git grep -n -A 5 PAT -- path`.

## Detection signal
`fatal: unable to resolve revision: -A` (or `-B`/`-C`); `option '-A' must come before non-option arguments`.

## Raw excerpts
```
L492 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git grep -n "json-value" -- src/metabase/request/schema.clj | head; git grep -n "mr/def ::json-value" -A 15 -- src/metabase/request/schema.clj
L493 [RESULT (ERROR)] Exit code 128
    src/metabase/request/schema.clj:26:(mr/def ::json-value
    src/metabase/request/schema.clj:34:   [:sequential [:ref ::json-value]]
    src/metabase/request/schema.clj:35:   [:map-of :string [:ref ::json-value]]])
    fatal: unable to resolve revision: -A
L612 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git grep -n "defmacro with-connections\|defn with-connections\|with-connections" -- test/metabase/metabot/settings_test.clj | head -3; git grep -n "defmacro with-connections" -A 25 --
L613 [RESULT] test/metabase/metabot/settings_test.clj:24:(defn- do-with-connections!
    fatal: unable to resolve revision: -A
-- subagent agent-a632b29c43867bb36 --
L274 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git grep -n "with-dynamic-fn-redefs \[" -- test/metabase/metabot | head -5; git grep -n "defmacro with-dynamic-fn-redefs" -A 12 -- test src | head -30
L275 [RESULT] test/metabase/metabot/agent/core_test.clj:39:                      (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly false)]
    fatal: unable to resolve revision: -A
```
