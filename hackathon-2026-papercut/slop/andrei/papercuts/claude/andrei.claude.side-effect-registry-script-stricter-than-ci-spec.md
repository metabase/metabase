---
title: `bun frontend/lint/scripts/side-effect-files.js` fails on any stale registry entry, but the CI spec guarding the same registry deliberately tolerates stale `self` entries, so a review agent drafted a nit claiming the check "isn't run in CI" for drift CI accepts by design
slug: side-effect-registry-script-stricter-than-ci-spec
kind: misleading-signal
impact: wasted-time
severity: low
status: open # script main() counts every stale entry; frontend/lint/tests/side-effect-files.unit.spec.js uses enforcedStale
area: frontend/lint/scripts/side-effect-files.js; frontend/lint/side-effect-files.json; frontend/lint/tests/side-effect-files.unit.spec.js
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/e2e06b7e-9fb4-4996-834f-51e03a49a048.jsonl
    lines: 317-536
    date: 2026-09-07
    jev: {any_papercut: 0.77, env_toolchain: 0.46, stale_state: 0.28, verify_mismatch: 0.76, misleading_code: 0.31, hidden_coupling: 0.82, stale_docs: 0.29, tool_footgun: 0.49, flaky: 0.68, agent_bug: 0.87, wasted_effort: 0.55, user_correction: 0.83}
---
## Summary
Reviewing a PR that moved `redux/store/mocks/api.ts` into test support, the agent ran the side-effect registry script, which printed `clean:   frontend/src/metabase/redux/store/mocks/api.ts` and "registry out of date" with exit 1, while master passed. It drafted a review comment saying the script is not run in CI and asking for `--update`. In fact the lint-rules jest project runs the same scan in CI and intentionally tolerates stale entries classified `self`, which is exactly this one. The user had to ask twice what the comment meant.

## Symptom
L317: `clean:   frontend/src/metabase/redux/store/mocks/api.ts ⏎ registry out of date. Run: bun frontend/lint/scripts/side-effect-files.js --update ⏎ exit=1`; L499 and L528: the user asks where the registry file is in the PR and what the drafted comment means.

## Timeline
- L280-L317: script run on the PR worktree fails with one stale `self` entry.
- L375-L383: same script passes on the other worktree.
- L438: finding drafted, saying the script is not a CI gate and `--update` should drop the entry.
- L495: draft revised, still saying the script is not run in CI.
- L499-L536: two clarification rounds; the comment is corrected.
- Cost: a review nit on something CI accepts by design, and several clarification rounds.

## Root cause
The script's `main` returns non-zero for `diff.stale` (any stale entry), while the CI spec reports only `enforcedStale(registry, stale)`, which drops stale `self` entries ("fails a stale global or entry entry but tolerates a stale self one"). The two checks disagree and the script's message does not say so.

## Why agents fall for it
The script is the documented regeneration tool and prints a confident "registry out of date"; nothing in its output says CI treats `self` entries as advisory, and the CI check lives in a jest spec rather than a workflow step.

## Current state
origin/master side-effect-files.js `main`: `const drifted = problems.length + diff.missing.length + diff.stale.length` → exit 1; side-effect-files.unit.spec.js: `...enforcedStale(registry, stale).map(…)` and a test "fails a stale global or entry entry but tolerates a stale self one".

## Suggested fix
- Make the script's check mode use `enforcedStale` too, printing tolerated `self` entries as a note rather than failing.
- Or say in its output that CI tolerates stale `self` entries.

## Detection signal
`clean:` lines only for entries classified `self` together with `registry out of date` and exit 1.

## Raw excerpts
```
L317 [RESULT] … --- side-effect registry check: ⏎ 258 files with import-time effects (12.2s) ⏎ clean:   frontend/src/metabase/redux/store/mocks/api.ts ⏎ ⏎ registry out of date. Run: bun frontend/lint/scripts/side-effect-files.js --update ⏎ exit=1
L383 [RESULT] --- side-effect registry check on master (is master already drifting?): ⏎ 259 files with import-time effects (20.9s) ⏎ exit=0
L506 [RESULT] in PR diff: 0 ⏎ on master: 163:    "frontend/src/metabase/redux/store/mocks/api.ts": "self", ⏎ at PR head: 163:    "frontend/src/metabase/redux/store/mocks/api.ts": "self",
```
