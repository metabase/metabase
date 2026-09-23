---
title: A "revert the fix, watch the test fail" probe built on `git stash push -- <file>` is a silent no-op once the fix is committed, so the test ran against the fixed code, passed, and the agent briefly concluded its regression test was vacuous
slug: git-stash-revert-probe-noop-on-committed-fix
kind: tool-quirk
impact: wasted-time
severity: medium
status: open
area: git stash push with a pathspec, compound Bash commands with output sent to /dev/null, revert-and-rerun test probes
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/b95fa36b-8d10-4667-8dcc-e441cdf5aced.jsonl
    lines: 523-552
    date: 2026-09-11
    jev: {any_papercut: 0.93, env_toolchain: 0.72, stale_state: 0.51, verify_mismatch: 0.76, misleading_code: 0.48, hidden_coupling: 0.54, stale_docs: 0.25, tool_footgun: 0.80, flaky: 0.87, agent_bug: 0.91, wasted_effort: 0.67, user_correction: 0.27}
---
## Summary
To show the rewritten regression test still fails without the fix, the agent ran `git stash push -m ... -- src/.../card.clj >/dev/null && SHA=$(git stash list | grep ...) && ./bin/test-agent ...; git stash apply $SHA ...`. The fix was already committed, so the file matched HEAD, `git stash push` printed "No local changes to save" into /dev/null and exited 0, `SHA` came back empty, and the test ran against the fixed source and passed. The agent added probes and reran before hand-reverting the source and seeing the expected failure. With an empty `SHA`, the trailing `git stash apply $SHA` would have applied whatever stash was on top; the list happened to be empty.

## Symptom
- L524: the test passes (`:fail 0`) with the fix supposedly stashed; the chain exits 1 at a later step.
- L529: stash list empty, src identical to the saved fixed copy.
- L539: probe output shows the reversal works, test still passes.
- L548: after a hand revert, the test fails as expected (`expected: 3 actual: 2`).

## Timeline
- L523-L524: stash-based probe "passes without the fix".
- L528-L529: state check; nothing was stashed.
- L533-L539: probe prints added to the test, rerun, still green.
- L543-L548: source hand-reverted, confirmed absent, test red.
- L552: agent retracts the "vacuous" reading.
- Cost: 3 extra test runs, about 6 tool calls, and a near-miss conclusion that the regression test proved nothing.

## Root cause
`git stash push -- <pathspec>` stashes only differences from HEAD; for a committed change there is nothing to stash and it exits 0. Redirecting its stdout hid the "No local changes to save" message, and `grep | head | cut` in the `SHA=$(...)` pipeline exits 0 on empty input, so the `&&` chain continued.

## Why agents fall for it
Stash is the usual way to "temporarily remove my change"; after committing, the mental model ("my fix is a local change") is stale, and every command in the chain reports success.

## Current state
Git behaviour, not repo code. Reproduced in PC/tmp with a scratch repo: after committing a change, `git stash push -m probe -- f.txt` prints "No local changes to save" and exits 0, the `SHA=$(git stash list ... | grep probe | head -1 | cut ...)` pipeline exits 0 with an empty value, and the file still holds the committed fix.

## Suggested fix
- For revert probes on committed work, check out the file from the parent commit (`git show HEAD~1:<path> > <path>` or `git checkout <base> -- <path>`), assert `git diff --quiet HEAD -- <path>` is false before running the test, and restore after.
- Never `git stash apply $VAR` without checking `$VAR` is non-empty.
- A shared "revert-probe" helper script for agents that does the checks above.

## Detection signal
`git stash push ... -- <path>` with output redirected to /dev/null inside an `&&` chain that then runs tests; "No local changes to save" when stash output is visible; a probe that "passes without the fix".

## Raw excerpts
```
L523 [CALL] Bash: cp src/metabase/queries/models/card.clj $SCRATCH/card.fixed3.clj && git stash push -m "tmp-verify-dynredef" -- src/metabase/queries/models/card.clj >/dev/null && SHA=$(git stash list --format='%H %gs' | /usr/bin/grep tmp-verify-dynredef | head -1 | cut -d' ' -f1) && ./bin/test-agent :only '[metabase.queries.models.card-test/cascade-database-change-ignores-app-db-row-order-test]' 2>&1 | /usr/bin/grep -E "^(FAIL|ERROR|expected|  actual|\{:test)|AssertionError|runaway"; git stash apply $SHA >/dev/null 2>&1 && git stash drop ... && diff -q $SCRATCH/card.fixed3.clj src/metabase/queries/models/card.clj && echo "src restored"
L524 [RESULT (ERROR)] Exit code 1 | {:test 1, :pass 6, :fail 0, :error 0, :type :summary, :duration 7648.351375, :single-threaded 1}
L528 [CALL] Bash: git stash list --format='%gd %gs' | head -3; echo "=== status ==="; git status --short; echo "=== src diff vs saved fix ==="; diff -q $SCRATCH/card.fixed3.clj src/metabase/queries/models/card.clj && echo IDENTICAL
L529 [RESULT] === status === | M test/metabase/queries/models/card_test.clj | === src diff vs saved fix === | IDENTICAL
L539 [RESULT] ok | PROBE order: (4 3 2) | PROBE expect-reverse-of: [2 3 4] | {:test 1, :pass 6, :fail 0, :error 0, :type :summary, ...}
L544 [RESULT] reverted to unfixed | CONFIRMED: fix absent from src
L548 [RESULT] PROBE order: (4 3 2) | PROBE expect-reverse-of: [2 3 4] | FAIL in metabase.queries.models.card-test/cascade-database-change-ignores-app-db-row-order-test (card_test.clj:1726) | expected: 3 | actual: 2 | ...
```
