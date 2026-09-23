---
title: Agent verified a refactor with a hand-picked test namespace list that omitted the test for the file it changed most, committed and pushed a broken kondo hook test
slug: handpicked-test-namespaces-miss-the-covering-test
kind: agent-behaviour
impact: introduced-bug
severity: medium
status: open
area: .clj-kondo/src/hooks/common/modules.clj, .clj-kondo/test/hooks/common/modules_test.clj, bin/test-agent :only
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 388-534
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.93, misleading_signal: 0.58, user_correction: 0.95, codebase_trap: 0.74, flailing: 0.70, env_friction: 0.93}
---
## Summary
Asked to simplify PR #82301, the agent rewrote `.clj-kondo/src/hooks/common/modules.clj` (548-line diff) and deleted its one-argument `module` function. It verified with `./bin/test-agent :only '[metabase.core.modules-nesting-test metabase.core.modules-consistency-test metabase.core.modules-test dev.modules-config-test metabase.util.log-test hooks.metabase.toucan.db-ns-test]'` (all pass), `./bin/mage -test modules`, and kondo, then committed and pushed `1a2e2bdcbe7` ("module tests, mage tests and lint all pass"). The list omitted `hooks.common.modules-test` (the hook's own test in `.clj-kondo/test/hooks/common/modules_test.clj`), which still called the deleted `modules/module`. The breakage surfaced only because a concurrent codex session's uncommitted edits "fixed" that test (L534: "My commit actually broke a test that still calls the deleted one-argument `module`").

## Symptom
"All tests passed" on a hand-picked list; broken test pushed. The user separately objected to the rest of the change (unrequested behaviour change for top-level namespaces, L479; inflated docstring churn, L482).

## Root cause
No tool maps changed files to their test namespaces for `.clj-kondo/src` hooks (tests live under a parallel `.clj-kondo/test` tree with `hooks.*` namespaces). test-agent's `:module` scoping works for `src` modules via `:ns-prefix`, not for kondo hooks. The agent built the list from memory.

## Why agents fall for it
Kondo hook tests are out of the usual `test/` tree, and the hook ns `hooks.common.modules` doesn't match module naming. Passing runs of related namespaces feel like coverage.

## Current state
.clj-kondo/test/hooks/common/modules_test.clj exists on master; CI runs `:only '["test" ".clj-kondo/test"]'` (.github/workflows/backend.yml:162-183) so CI would have caught it. No "tests for changed files" helper covers `.clj-kondo/src`.

## Suggested fix
- A `./bin/test-agent --changed` (or mage task) mapping each changed `.clj-kondo/src/hooks/x/y.clj` to `hooks.x.y-test` and each `src` file to its module's tests.
- Until then, CLAUDE.md: "After changing a kondo hook, run `./bin/test-agent :only '[\".clj-kondo/test\"]'`."

## Detection signal
Diff touches `.clj-kondo/src/hooks/<p>.clj` and no test-agent invocation in the session includes `hooks.<p>-test` or the `.clj-kondo/test` directory before `git push`.
