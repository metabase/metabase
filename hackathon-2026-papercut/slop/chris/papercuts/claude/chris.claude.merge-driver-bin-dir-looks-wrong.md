---
title: bin/merge-kondo-ratchets resolves mage via the script's own path; review bots flag it as a bug and the "fix" breaks the merge-driver tests
slug: merge-driver-bin-dir-looks-wrong
kind: misleading-signal
impact: wasted-time
severity: low
status: fixed
area: bin/merge-kondo-ratchets, mage/test/mage/merge_kondo_ratchets_test.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 938-1310
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.98, tool_misuse: 0.88, misleading_signal: 0.50, user_correction: 0.91, codebase_trap: 0.89, flailing: 0.51, env_friction: 0.79}
---
## Summary
The ratchet merge driver computes `bin_dir` from `${BASH_SOURCE[0]}`, then `cd`s to `git rev-parse --show-toplevel`, then runs `"$bin_dir/mage"`. A /code-review subagent called this a medium bug ("reads B's stages but loads A's policy code; use plain `bin/mage`"). The parent agent agreed, argued it on paper, and when the user said "do it" it replaced it with `bin/mage`. The mage merge-driver tests went from 49 green assertions to 22 failures: the tests run the metabase checkout's script against a throwaway git repo in a temp dir, where `bin/mage` does not exist. Reverted; the user asked for a comment "so future review bots don't trip", which was added.

## Symptom
```
L1263 === merge-driver end-to-end tests ===
Ran 7 tests containing 49 assertions.
22 failures, 0 errors.
L1263 .../bin/merge-kondo-ratchets: line 10: cd: null directory   (run from /tmp)
```

## Timeline
- L936 review finding: "bin/merge-kondo-ratchets:42 — medium — `$bin_dir/mage` breaks when the script is reached through a symlink or from another worktree."
- L949 agent endorses: "Finding 1 ... is real ... `bin/mage` — plain relative — is self-consistent and `$bin_dir` isn't."
- L1248 user: "do it". L1255 agent deletes `bin_dir`, uses `bin/mage`.
- L1263 tests: 22 failures. L1268 "No — and the tests just proved it. Reverting".
- L1289 agent: "`$bin_dir` is load-bearing, and I had the design backwards. The script is a tool applied to whatever repository you're standing in ... I should have run the merge tests before endorsing that finding".
- L1292 user: "maybe a comment is worth it so future review bots don't trip?" -> L1296-1317 comment added (`# Find mage through this script's path: the cd below can land in a different repository.`).

## Root cause
Non-obvious design (tool runs against a foreign repo) with no comment; the test that encodes it lives in `mage/test`, far from the script. Reviewer bots pattern-match "script uses its own dir after cd to toplevel" as an inconsistency.

## Why agents fall for it
The reviewer's argument is locally convincing, and the agent reasoned instead of running the nearby test first.

## Current state
Fixed by comment: `bin/merge-kondo-ratchets:8` "Find mage through this script's path: the cd below can land in a different repository." Script now also handles `.clj-kondo/config/modules/ratchets.edn`.

## Suggested fix
Done. Pattern: when a review finding touches a script with dedicated tests, run those tests before endorsing it.

## Detection signal
Agent endorses/apply a review-bot finding, then the directly related test suite fails and the change is reverted within minutes.

## Raw excerpts
```
L1289 [ASSISTANT] Why it breaks. mage/test/mage/merge_kondo_ratchets_test.clj:60 builds a throwaway git repo in a temp dir with a conflicted ratchets.edn, then runs the metabase repo's script against it. The script cds to that repo's toplevel — so a relative bin/mage resolves to <tempdir>/bin/mage, which doesn't exist.
```
