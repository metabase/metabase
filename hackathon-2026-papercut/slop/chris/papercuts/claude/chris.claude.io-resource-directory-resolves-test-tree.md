---
title: `(io/resource "metabase/metabot/self")` on a package directory resolves to the test tree, because src and test share package dirs on the classpath
slug: io-resource-directory-resolves-test-tree
kind: codebase-trap
impact: wasted-time
severity: low
status: open
area: classpath layout (src/ and test/ both contain metabase/metabot/self/); benchmark_test.clj in the OSI stack
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 1549-1580
    date: 2026-08-29
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.60, user_correction: 0.14, codebase_trap: 0.82, flailing: 0.54, env_friction: 0.70}
---
## Summary
A guard test hardcoded a list of provider-adapter source files and went stale when master added adapters. The
agent rewrote it to list `metabase/metabot/self/*.clj` from the filesystem via
`(io/file (io/resource "metabase/metabot/self"))`. With the test classpath, the directory resource resolved to
`test/metabase/metabot/self/` (holding `azure_test.clj`, `bedrock_test.clj`, ...), not `src/`. The "adapters"
set was test files and the subset assertion failed. It took two runs and a separate off-by-one path fix to
notice. The fix anchored on a known source *file* (`io/resource "metabase/metabot/self.clj"`) and took its
sibling directory.

## Symptom
```
L1575 FAIL in ...benchmark-test/generation-code-hash-covers-the-provider-call-path-test (benchmark_test.clj:423)
a provider adapter is missing from generation-source-resources
expected: (set/subset? adapters sources)
  actual: (not (set/subset? #{"metabase/metabot/self/azure_test.clj" "metabase/metabot/self/b...
L1578 [ASSISTANT] The resource resolved to the *test* tree, not `src`. Anchoring on a known source file instead.
```

## Timeline
- L1549 "The guard hardcodes the list, which is exactly why it went stale. Let me make it derive from the filesystem".
- L1553-1557: rewrite; missing `clojure.string` require.
- L1560-1563: failure, blamed on "`inc` on `lastIndexOf` chops a character".
- L1571-1575: still failing; full output shows `_test.clj` names.
- L1579-1580: anchored on `self.clj`; passes.

## Root cause
`io/resource` returns the *first* classpath entry that has the path. For a directory path, every root with that
package dir matches (`src`, `test`, `enterprise/backend/src`, ...). Which comes first depends on alias order in
`deps.edn`, and under `:test` the test dirs precede src.

## Why agents fall for it
Most `io/resource` calls in the codebase target files (`.edn`, `.selmer`), where the path is unique. Treating a
package directory as a unique resource is a natural extension that breaks without any error.

## Current state
The layout is unchanged: `test/metabase/metabot/self/` and `src/metabase/metabot/self/` both exist. The code in
question lives on the unmerged OSI benchmark branch (#79981). No doc warns about directory resources.

## Suggested fix
A test util such as `mt/source-dir "metabase/metabot/self"` that resolves via a known source-root list, or a
kondo hook warning on `io/resource` with a string literal that has no `.` extension.

## Detection signal
`io/resource` called with a literal lacking a file extension; test failures whose paths include `_test.clj`
where source files were expected.

## Raw excerpts
```
L1579 old: root (io/file (io/resource "metabase/metabot/self"))
      new: anchored on (io/resource "metabase/metabot/self.clj") and its parent/sibling dir
L1580 Ran 1 tests ... 3 assertions, 0 failures, 0 errors.
```
