---
title: The mage "modules triggering driver tests" cap counts nested modules, so carving a child out of a triggering module fails CI
slug: driver-test-cap-counts-nested-modules
kind: codebase-trap
impact: wasted-time
severity: medium
status: open
area: mage/test/mage/modules_test.clj (module-graph-may-not-become-more-connected), mage/src/mage/modules.clj (driver-affecting-overrides)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 5053-5209
    date: 2026-09-17
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.94, misleading_signal: 0.66, user_correction: 0.63, codebase_trap: 0.76, flailing: 0.27, env_friction: 0.87}
---
## Summary
`mage.modules-test/module-graph-may-not-become-more-connected` is a ratchet on how many modules make CI
run all driver tests (`max-allowed-count 47`). It counts every module in the config, nested ones
included. With nested modules, splitting a module into a parent and a child (for example `task` →
`task` + `task.secure-delegate`) adds one module. If the parent triggers driver tests, the child
inherits them, and the count goes up by one even though the graph did not become more connected. The test
comment and the failure message give two remedies: raise the cap, or add the module to
`driver-affecting-overrides`. Neither remedy mentions nesting. The history comment in the test shows
this already happened for `lib.schema` (bumped to 47 on 2026-09-11).

## Symptom
CI "Mage / Run mage tests" failed on a PR that only carved out a nested module:
```
FAIL in (module-graph-may-not-become-more-connected) (mage/test/mage/modules_test.clj:292)
... Too many modules trigger driver tests! Expected <= 47, got 48.
```

## Timeline
- L5012 agent pushes the new nested module `task.secure-delegate`. Local checks were `mage project-tests modules` and kondo, not `./bin/mage -test`.
- L5061 CI log: `FAIL in (module-graph-may-not-become-more-connected) (.../mage/test/mage/modules_test.clj:292)`.
- L5064 agent: "The new module adds a 48th module that triggers driver tests, and the cap is 47."
- L5073 agent adds `task.secure-delegate` next to `task` in the exemption list in `mage/src/mage/modules.clj`.
- L5088 THINKING: "The dependency cap counts nested modules too, which explains why extracting a child from a driver-test-triggering module raised the count (same cause as the 09-11 bump to 47 for `lib.schema`)."
- L5100 measurement: `{:all 47, :top 28, :nested (lib.agent-lib lib.be ... enterprise/transforms.python)}`. 19 of the 47 are nested.
- L5103-5120 agent changes the test to count top-level modules only (cap 28) and pushes.
- L5190 agent points out the gap it opened: a nested module whose parent does *not* trigger would go uncounted (`users.tenants`, `util.graph`, `enterprise/permissions`, `enterprise/transforms.python`). It proposes "count a nested module unless its parent triggers too" (cap 32).
- L5192 user: "yes that is a good compromise". L5205 pushed `3a50b2494f2`.

## Root cause
The ratchet predates nested modules. Its unit is "module", and nesting made "module" cheaper to create
without changing what runs in CI.

## Why agents fall for it
- `project-tests modules` and kondo pass. The cap lives in the mage bb test suite, which agents run less
  often, so the failure shows up first in CI.
- The failure message suggests bumping the cap or adding an override, and both hide the real issue.

## Current state
Still present in the current checkout: `mage/test/mage/modules_test.clj:287-290` counts `(keys deps)`
with no parent filter, and `max-allowed-count 47` is at :315. The fix was on branch
`untangle-util-knots` (#77954) and is not on master. Not documented in CLAUDE.md, skills, or memory
(the `project_nested_modules` memory does not mention the cap).

## Suggested fix
Count a nested module only when its parent does not already trigger driver tests (the compromise from
the transcript). Or say in the failure message: "if you just carved a child out of a triggering module,
add it next to its parent in driver-affecting-overrides".

## Detection signal
- CI failure in `module-graph-may-not-become-more-connected` on a PR whose config diff adds a dotted module name.
- A commit that raises `max-allowed-count` in the same PR as a new dotted module.

## Raw excerpts
```
L5061 [RESULT] Mage	Run mage tests	2026-09-17T08:27:41.3677349Z FAIL in (module-graph-may-not-become-more-connected) (/home/runner/work/metabase/metabase/mage/test/mage/modules_test.clj:292)
L5070 [RESULT]           ;; expensive. If this test fails, either:
          ;;   1. Your module legitimately affects drivers -- bump max-allowed-count
          ;;   2. Your module is infrastructure/gating, not driver logic
          ;;      -- add it to driver-affecting-overrides in mage.modules
          ;; History:
          ;; 2026-02-06 Initial count: 37
          ;; 2026-02-10 Bumped to 38 for sql-tools + sql-parsing
L5100 [RESULT] {:all 47, :top 28, :nested (lib.agent-lib lib.be lib.legacy-mbql lib.metadata lib.metric lib.schema query-processor.cache-backend query-processor.driver-api query-processor.pivot sql-tools.parsing sync.analyze transforms.base transforms.indexes users.tenants util.graph enterprise/permissions enterprise/permissions.impersonation enterprise/permissions.sandbox enterprise/transforms.python)}
L5186 [RESULT] {:top 28, :alt 32, :alt-nested (users.tenants util.graph enterprise/permissions enterprise/transforms.python)}
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
  lines: 1184-1241, 1400-1503, 1557-1643
  date: 2026-08-30 (earlier than the 09-17 occurrence above, same branch stack)
  jev (chunk 2, 861-1359): {self_inflicted_bug: 0.92, tool_misuse: 0.97, misleading_signal: 0.49, user_correction: 0.24, codebase_trap: 0.83, flailing: 0.46, env_friction: 0.87}
  jev (chunk 3, 1307-1761): {self_inflicted_bug: 0.98, tool_misuse: 0.62, misleading_signal: 0.56, user_correction: 0.21, codebase_trap: 0.87, flailing: 0.77, env_friction: 0.81}
- The same number existed in three places with three semantics: `mage.modules-test` hardcoded `max-allowed-count 44` with a hand-kept History comment (actual 46); `dev.deps-graph/driver-test-triggering-modules` counted 47 (it includes the library ns `connection-pool`, which `kondo-config` drops, L1231-1235); and an upstack branch had changed the mage test to count "distinct top-level ancestors" (L1400, L1438 `max-allowed-top-level-count`).
- **Misleading win:** after restacking onto the nested-config branch, the top-level count fell 46 → 33. L1557 ASSISTANT: "33, down from 46 — nesting collapses 13 top-level driver-test triggers. Blessing that". The agent committed "Lower the driver-test trigger ratchet to 33" (L1570). Prompted to check, it measured (L1619): raw triggering modules 46 → 49, top-level 46 → 33, **namespaces in them 696 → 696**. "`file->module` resolves to the *most specific* module (longest-prefix) ... nothing about what CI runs changed ... the top-level collapse I just committed is wrong: it reports 46→33 as a win when nothing moved." The user chose "raw module count + namespace stat" (L1640-1641) and the collapse was reverted.
- This complements the 09-17 finding. Module-count ratchets move under pure re-bucketing (nesting or splitting) in *both* directions. Only a namespace-weighted count tracks what CI actually runs.
