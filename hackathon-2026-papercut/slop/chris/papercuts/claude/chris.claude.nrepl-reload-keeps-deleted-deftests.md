---
title: "`(require 'x-test :reload)` in a warm nREPL keeps deleted or renamed deftests, so run-tests reports failures from tests that no longer exist"
slug: nrepl-reload-keeps-deleted-deftests
kind: misleading-signal
impact: wasted-time
severity: medium
status: documented-still-hit
area: .claude/skills/clojure-eval/SKILL.md (tells agents to always use :reload), clj-nrepl-eval workflows, clojure.test
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-cycle-clusters/aa87adef-8b0f-46f8-bdb7-486d04e80b58.jsonl
    lines: 1017-1078
    date: 2026-09-11/12
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.69, misleading_signal: 0.84, user_correction: 0.32, codebase_trap: 0.64, flailing: 0.41, env_friction: 0.92}
---
## Summary
The agent rewrote a test namespace (`metabase.core.module-cycle-ratchet-test`). It deleted and renamed
tests and changed a helper's arity. It then reloaded the namespace in the running nREPL with
`(require '... :reload)` and ran `clojure.test/run-tests`. `:reload` re-evaluates the file but does not
remove vars that the new file no longer defines. The old `deftest` vars stayed interned, and
`run-tests` ran them against the new code. The result was "7 failures, 2 errors" that came from tests
no longer in the file. The agent fixed it with `remove-ns` plus removing the namespace from
`*loaded-libs*`, then re-required. After that, 1 real failure was left.

## Symptom
```
L1038 [RESULT] Ran 31 tests containing 55 assertions.
7 failures, 2 errors.
L1044 [RESULT] FAIL in (observing-records-the-structure-as-it-stands-test) ...
   expected: {:mode :enforce, :uses {galactic-center {:modules #{...}, :internal-edges 7, :cross-subtree-edges 2} ...
```
The new file had 25 tests. The run counted 31. The failing expectations used the old record shape
(`:internal-edges`) that the rewrite had removed.

## Timeline
- L1017 agent rewrites the whole test file (Write).
- L1036 `clj-nrepl-eval ... "(require 'dev.module-cycle-ratchet 'dev.module-cycle-scan 'metabase.core.module-cycle-ratchet-test :reload) (clojure.test/run-tests ...)"` → 31 tests, 7 failures, 2 errors.
- L1043 re-run with output captured; failures reference deleted tests.
- L1054 agent: "Those failures are ghosts: `require :reload` re-evaluates the file but leaves vars from the previous version interned, so `run-tests` was running deleted tests (`a-split-cannot-smuggle-in-an-edge-test`, the old 3-arg `recorded` helper) alongside the new ones."
- L1055 `(remove-ns 'metabase.core.module-cycle-ratchet-test) (dosync (alter @#'clojure.core/*loaded-libs* disj '...)) (require ...)` → 25 tests, 1 real failure (L1056).
- Later runs (L1076, L1241) always use the remove-ns recipe. L1123 adds a cold `./bin/test-agent` run: "a warm REPL can hide load-order problems".

## Root cause
Clojure's `:reload` re-evaluates the file but does not remove vars. `clojure.test/run-tests` runs every
var with `:test` metadata in the namespace, stale ones included. The repo's clojure-eval skill tells
agents to use `:reload` every time and has no caveat about removed or renamed tests.

## Why agents fall for it
- The skill says "**Always use :reload:** When requiring namespaces, use `:reload` to pick up recent changes" (SKILL.md:157), and gives the recipe `(require 'my.namespace :reload)` (:100, :112, :167).
- The ghost failures look like real regressions in the new code: the file name is the same, and the test names are plausible.
- The test count (31 against 25) is the only clue, and nobody compares it.

## Current state
- `.claude/skills/clojure-eval/SKILL.md:100-173` still says to always `:reload`, with no warning about deleted or renamed tests.
- The memory `reference_warm_repl_masks_cold_load.md` documents the `remove-ns` + `*loaded-libs*` recipe, but for a different symptom (a forward reference that passes warm and fails cold). Its index line in MEMORY.md is "Warm REPL masks cold-load errors — verify with test-agent", which does not match "failures from deleted tests". So this is documented, but the note is filed under another symptom, and it was still hit.

## Suggested fix
- clojure-eval skill: after renaming or deleting tests, run `(remove-ns 'x-test)` first, or run tests with `./bin/test-agent`. Show the one-liner:
  `(remove-ns 'x) (dosync (alter @#'clojure.core/*loaded-libs* disj 'x)) (require 'x)`.
- Or provide a `dev/reload-test-ns!` helper (or have the eval tool always do a clean reload for `*-test` namespaces).
- Update the memory index line so it covers "ghost failures from deleted deftests".

## Detection signal
- `run-tests` reports more tests than there are `deftest` forms in the file.
- FAIL/ERROR test names that do not appear in the file (grep the test file for each failing name).
- A transcript that writes a whole test file with Write, then does `(require ... :reload)` and `run-tests`.

## Raw excerpts
```
L1036 [TOOL Bash] clj-nrepl-eval -p <REDACTED> --timeout 900000 "(require 'dev.module-cycle-ratchet 'dev.module-cycle-scan 'dev.deps-graph :reload) (dev.module-cycle-scan/fix! {:seed true})" ... "(require ... 'metabase.core.module-cycle-ratchet-test :reload) (binding [clojure.test/*test-out* *out*] (clojure.test/run-tests 'metabase.core.module-cycle-ratchet-test))"
L1038 [RESULT] Ran 31 tests containing 55 assertions.  7 failures, 2 errors.
L1054 [ASSISTANT] Those failures are ghosts: `require :reload` re-evaluates the file but leaves vars from the previous version interned, so `run-tests` was running deleted tests (`a-split-cannot-smuggle-in-an-edge-test`, the old 3-arg `recorded` helper) alongside the new ones. I need to drop the namespace before reloading — one request.
L1055 [TOOL Bash] clj-nrepl-eval ... "(remove-ns 'metabase.core.module-cycle-ratchet-test)
(dosync (alter @#'clojure.core/*loaded-libs* disj 'metabase.core.module-cycle-ra ...
L1056 [RESULT] Ran 25 tests containing 46 assertions.  1 failures, 0 errors.
```
