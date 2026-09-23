---
title: git-spice `--restack none` (space-separated) is parsed as a branch named "none"; the flag needs `--restack=none`
slug: git-spice-optional-value-flag-needs-equals
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: git-spice CLI (kong-style flags), `git-spice branch delete`
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-transform-native-perms/608c9180-d7db-4302-b960-7c77624e1415.jsonl
    lines: 103-123
    date: 2026-09-01
    jev: {self_inflicted_bug: 0.92, tool_misuse: 0.91, misleading_signal: 0.91, user_correction: 0.16, codebase_trap: 0.71, flailing: 0.38, env_friction: 0.94}
---
## Summary
According to `git-spice branch delete --help`, `--restack` takes one of `none`, `aboves`, or `upstack`.
Written as `--restack none`, git-spice took `none` as a positional branch argument and failed with
`FTL git-spice: lookup branch none: resolve head: does not exist`. `--restack=none` worked. The failure
was harmless because the command failed before it deleted anything. With a real branch name in that
position, the command could have deleted the wrong branch.

## Symptom
```
L118 git-spice branch delete --force --restack none kondo-ratchets-master-only
L119 FTL git-spice: lookup branch none: resolve head: does not exist
L122 git-spice branch delete --force --restack=none kondo-ratchets-master-only
L123 INF beguild-30-config-tests: retargeted upstack onto master
     INF kondo-ratchets-master-only: deleted (was 26aac55)
```

## Root cause
git-spice's CLI parser treats `--restack` as a flag with an optional value, or as a boolean with an enum
value. A value separated by a space is not bound to the flag and becomes a positional argument. The
help text shows `--restack` with its enum but does not say that `=` is required.

## Why agents fall for it
Most CLIs accept both `--flag value` and `--flag=value`.

## Current state
Not re-tested in this drill. Not in memory or the git-spice skill.

## Suggested fix
Add a line to the git-spice skill or memory: "git-spice enum flags need `=`: `--restack=none`."

## Detection signal
`lookup branch <word>: resolve head: does not exist` where `<word>` is a flag value that appears in the help text.

## Raw excerpts
See Symptom.
