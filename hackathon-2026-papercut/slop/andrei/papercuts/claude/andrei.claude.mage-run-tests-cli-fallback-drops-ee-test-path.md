---
title: Without a running nREPL, `./bin/mage run-tests` prints `clj -X:dev:ee:ee-dev:test` but executes `-X:dev:dev-ee:ee:test` (no such alias), so every enterprise test namespace fails with "Could not locate ..._test__init.class"
slug: mage-run-tests-cli-fallback-drops-ee-test-path
kind: codebase-trap
impact: wasted-time
severity: medium
status: open # origin/master mage/src/mage/quick_test_runner.clj run-tests-cli still uses :dev-ee; deps.edn defines only :ee and :ee-dev
area: mage/src/mage/quick_test_runner.clj (run-tests-cli), deps.edn :ee-dev alias, bb.edn run-tests task
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/758d7b46-4e50-449e-83b2-4a35df2a52e9.jsonl
    lines: 457-490
    date: 2026-08-27
    jev: {any_papercut: 0.87, env_toolchain: 0.89, stale_state: 0.61, verify_mismatch: 0.39, misleading_code: 0.26, hidden_coupling: 0.79, stale_docs: 0.32, tool_footgun: 0.84, flaky: 0.27, agent_bug: 0.72, wasted_effort: 0.58, user_correction: 0.21}
---
## Summary
In a worktree with no backend REPL, the agent ran `./bin/mage run-tests` on an enterprise test namespace, by namespace and by file path. Both failed to find the namespace on the classpath. The CLI fallback runs `clojure -X:dev:dev-ee:ee:test`; `:dev-ee` is not an alias, so `enterprise/backend/test` (added by `:ee-dev`) is missing, while the banner shows the correct command. Running `clojure -X:dev:ee:ee-dev:test :only <ns>` by hand passed.

## Symptom
- L458 and L468: `Could not locate metabase_enterprise/metabot/api/permissions_test__init.class, ..._test.clj or ..._test.cljc on classpath.`

## Timeline
- L457-L458: run by namespace fails.
- L462-L468: run by file path fails the same way.
- L471-L485: looks for the mage source (a glob on `bin/mage/*.clj` hits zsh no-match) and at the CI workflow aliases.
- L489-L490: `MB_EDITION=ee clojure -X:dev:ee:ee-dev:test :only ...` passes.
- Cost: 2 failed test runs and 5 investigation calls.

## Root cause
`run-tests-cli` builds the display string "clj -X:dev:ee:ee-dev:test" but calls `(shell/sh* "clojure" "-X:dev:dev-ee:ee:test" ...)`. deps.edn has `:ee` (enterprise/backend/src) and `:ee-dev` (enterprise/backend/test) but no `:dev-ee`, and the Clojure CLI ignores unknown aliases. Present since the 2025-11-25 "Upgrades mage run-tests" change.

## Why agents fall for it
The error blames the namespace name or file layout, and the printed command, which agents would copy to reproduce, is the working one.

## Current state
origin/master quick_test_runner.clj lines 166-169 unchanged; `git show origin/master:deps.edn | grep -c :dev-ee` is 0.

## Suggested fix
- Change the executed aliases to `-X:dev:ee:ee-dev:test` and build the display string from the same vector.
- Add a mage test that the CLI fallback resolves an EE test namespace.

## Detection signal
`./bin/mage run-tests metabase-enterprise...` followed by `Could not locate metabase_enterprise/..._test__init.class`.

## Raw excerpts
```
L457 [CALL] Bash: ./bin/mage run-tests metabase-enterprise.metabot.api.permissions-test 2>&1 | tail -8
L458 [RESULT] ... :cause | "Could not locate metabase_enterprise/metabot/api/permissions_test__init.class, metabase_enterprise/metabot/api/permissions_test.clj or metabase_enterprise/metabot/api/permissions_test.cljc on classpath. ..."}}
L462 [CALL] Bash: ./bin/mage run-tests enterprise/backend/test/metabase_enterprise/metabot/api/permissions_test.clj 2>&1 | tail -8
L468 [RESULT] ... "Could not locate metabase_enterprise/metabot/api/permissions_test__init.class, ... on classpath. ..."
L476 [RESULT] (eval):1: no matches found: bin/mage/*.clj | --- | .github/workflows/backend.yml:70:      - run: clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood ...
L489 [CALL] Bash: MB_EDITION=ee clojure -X:dev:ee:ee-dev:test :only metabase-enterprise.metabot.api.permissions-test 2>&1 | tail -12
L490 [RESULT] ... Ran 2 tests in parallel, 6 single-threaded. | Finding and running tests took 20.3 s. | All tests passed.
```
