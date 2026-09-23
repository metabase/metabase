---
title: Agents read EDN data with clojure.core/read-string instead of clojure.edn/read-string; nothing lints it, and mage has pre-existing examples to copy
slug: clojure-core-read-string-for-edn
kind: codebase-trap
impact: introduced-bug
severity: low
status: open
area: mage/ (bb tooling), dev/src, test helpers that parse .edn files; .clj-kondo/config.edn :discouraged-var
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
    lines: 999-1025
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}
---
## Summary
While simplifying `mage/test/mage/merge_kondo_ratchets_test.clj` (PR #81341), the agent reduced a helper to `(read-string (ratchets-text dir))` to read the merged `.clj-kondo/ratchets.edn`.
The user caught it: "using read-string for edn is unsafe i believe? can we not use a edn reader instead of a clojure one?"
`clojure.core/read-string` honours `*read-eval*` (`#=(...)`) and every data reader, so it can run code. `clojure.edn/read-string` is the safe reader for data.
The agent confirmed there were three more bare `read-string` calls in mage (pre-existing) and fixed only its own.

## Symptom
User correction during review of an uncommitted diff. Tests passed with either reader, so no test would have caught it.

## Timeline
- L999 USER: "using read-string for edn is unsafe i believe? can we not use a edn reader instead of a clojure one?"
- L1003: "You're right — `clojure.core/read-string` honours `*read-eval*` and arbitrary tagged literals. It was pre-existing there, but my change made it the whole body."
- L1004-1005: grep lists the others: `mage/src/mage/be_dev.clj:74` (deliberate eval), `mage/src/mage/analytics.clj:88`, `mage/src/mage/readability_check.clj:12`, `bb.edn` task string.
- L1009-1023: `[clojure.edn :as edn]` added, `(edn/read-string (ratchets-text dir))`. 95 tests / 761 assertions pass.

## Root cause
- `read-string` is the shortest and most familiar name, and existing code in the same directory uses it for data.
- The kondo `:discouraged-var` map (`.clj-kondo/config.edn:319+`) discourages `eval`, `println`, etc., but not `clojure.core/read-string` or `load-string`. `mage/src/mage/readability_check.clj:17` has an ignore for `eval` right next to the unflagged `read-string`.

## Why agents fall for it
- There are nearby precedents (`mage/src/mage/analytics.clj:88` parses nREPL results with `read-string`).
- Both readers behave the same on trusted, well-formed data, so tests can't tell them apart.
- The input here (a merged git conflict of `ratchets.edn`) feels internal, but the merge script runs on a file from another branch.

## Current state
Still present on master (2026-09-23):
- `mage/src/mage/analytics.clj:88` `(read-string result)`
- `mage/src/mage/readability_check.clj:12` `(read-string (slurp "resources/data_readers.clj"))`
- `dev/src/dev/coverage.clj:195`, `:265`, `:476` (deliberate eval)
- `mage/src/mage/be_dev.clj:74` (deliberate eval)
- No `:discouraged-var` entry for `clojure.core/read-string`.
Not documented in CLAUDE.md, the clojure-write/clojure-review skills, or memory.

## Suggested fix
- Add `clojure.core/read-string {:message "Use clojure.edn/read-string for data; clojure.core/read-string can evaluate #= forms"}` to `:discouraged-var`, with inline ignores at the deliberate-eval sites (`be_dev.clj`, `coverage.clj`).
- Switch `analytics.clj:88` and `readability_check.clj:12` to `edn/read-string`.
- Add a line to the clojure-review skill.

## Detection signal
- The diff adds `(read-string` without an `edn/` prefix. Easy to lint.
- In a transcript, `read-string` applied to `slurp`ed file content or to subprocess output.

## Raw excerpts
```
L999 [USER] using read-string for edn is unsafe i believe? can we not use a edn reader instead of a clojure one?
L1004 [TOOL Bash] echo "=== bare read-string in the ratchet tooling ===" && grep -rn "[^/-]read-string" bb.edn bin/merge-kondo-ratchets mage/src/mage/*.clj mage/test/mage/*.clj dev/src/dev/kondo_ratchet.clj dev/test/metabase/core/kondo_ratchet_test.clj 2>/dev/null | grep -v "edn/read-string"
L1005 [RESULT] === bare read-string in the ratchet tooling ===
bb.edn:573: ...'(read-string \"::hello\")'"
mage/src/mage/be_dev.clj:74:     (eval (read-string
mage/src/mage/analytics.clj:88:       (if (and result (= :success (:status (read-string result))))
mage/src/mage/readability_check.clj:12:  (let [reader-tags (conj (keys (read-string
mage/test/mage/merge_kondo_ratchets_test.clj:93:  (read-string (ratchets-text dir)))
```
