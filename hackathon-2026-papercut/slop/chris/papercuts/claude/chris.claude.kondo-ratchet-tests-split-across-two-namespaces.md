---
title: Tests for dev/src/dev/kondo_ratchet.clj live in two namespaces (kondo-ratchet-test and kondo-ratchet-check-test); running only the obvious one missed an output-pinning test, and CI caught the regression
slug: kondo-ratchet-tests-split-across-two-namespaces
kind: test-harness
impact: introduced-bug
severity: medium
status: documented-still-hit
area: dev/src/dev/kondo_ratchet.clj, dev/test/metabase/core/kondo_ratchet_test.clj, dev/test/metabase/core/kondo_ratchet_check_test.clj, mage/src/mage/project_tests.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
    lines: 600-871, 1213-1296
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}
---
## Summary
On #81319 (BEGUILD-30 ratchet policy) the agent added a `fail!` helper to `dev/src/dev/kondo_ratchet.clj` so that validation errors print one line instead of a stack dump.
The helper also changed the drift path. That path used to print its findings and throw silently. Now it printed an extra summary line (`…/ratchets.edn drifted from the source tree`).
To check the change, the agent ran `./bin/test-agent :only '[metabase.core.kondo-ratchet-test]'`, `./bin/mage check-kondo-ratchets`, and the mage tests. All passed. It pushed.
CI's `backend-tests / Project tests: Backend checks` failed on `check-reports-empty-unlimited-test`, which pins the exact lines `check` prints.
That test lives in a **second** namespace, `metabase.core.kondo-ratchet-check-test`, which the agent never ran.
After CI failed, it ran `./bin/mage project-tests backend` locally, and that suite would have caught the regression before the push.

## Symptom
- L1214: `#81319: total=213 failing=2`. L1226: `backend-tests / Project tests: Backend checks`.
- `~/bin/ci-failures 81319` reported "⚠ No test failure details found in job logs." (L1231).
- `gh run view --job … --log` returned nothing twice (L1233, L1239). The log was only readable through `gh api repos/.../actions/jobs/<id>/logs` (L1242). See `gh-ci-inspection-silent-empty-and-in-progress-logs`.
- The failure summary line was `{:test 69, :pass 4494, :fail 1, ...}` (L1256).

## Timeline
- L600-668: the agent designs and adds `fail!` (print, then `ex-info` with `:babashka/exit 1, :mage/quiet true`) and uses it at three throw sites, including the drift path.
- L739 / L806: `./bin/test-agent :only '[metabase.core.kondo-ratchet-test]'` passes.
- L868-871: commit, `git push --force-with-lease`, restack.
- L1213-1256: CI fails. Getting the log takes four attempts.
- L1259: "Found it — a real regression from my change ... `check-reports-empty-unlimited-test` pins the lines `check` prints. The old drifted path threw *without* printing ... My `fail!` unified both to print-and-throw, adding a line".
- L1260-1271: the agent splits the helper into `exit!` (throw only) and `fail!` (print, then `exit!`).
- L1273: `./bin/mage project-tests backend`: 69 tests, 4495 assertions, 0 failures.

## Root cause
The source namespace `dev.kondo-ratchet` has two test namespaces with no naming link between them: `metabase.core.kondo-ratchet-test` and `metabase.core.kondo-ratchet-check-test`.
Given a single source file, an agent picks the test namespace whose name matches it.
The tests that pin `check`'s output are in the `-check-test` namespace.
The suite that runs both is `./bin/mage project-tests backend` (or `ratchets`), and it isn't tied to the source file in any discoverable way.

## Why agents fall for it
- "Run the test namespace named after the file" is a good heuristic that fails here.
- CLAUDE.md lists `./bin/mage project-tests <backend|migrations|modules|ratchets>` under Module Boundaries, but not as "run this after touching dev/src/dev/kondo_ratchet.clj".
- The change was meant as a UX fix (less noise), so a change in output didn't look like a behaviour change.

## Current state
- Still split: `dev/test/metabase/core/kondo_ratchet_test.clj` and `dev/test/metabase/core/kondo_ratchet_check_test.clj` (`check-reports-empty-unlimited-test` at :118).
- `mage/src/mage/project_tests.clj:17-20` groups them: `ratchet-test-namespaces '[metabase.core.kondo-ratchet-test metabase.core.kondo-ratchet-check-test]`, and `backend-check-namespaces` includes them.
- The `exit!` / `fail!` split the agent made is on master: `dev/src/dev/kondo_ratchet.clj:974` and `:979`.
- CLAUDE.md documents `project-tests`, but nothing maps "tooling source file → suite".

## Suggested fix
- Add a line to the `dev.kondo-ratchet` ns docstring or to CLAUDE.md: "Changes here: run `./bin/mage project-tests ratchets`". Or merge the two test namespaces.
- More generally, `./bin/test-agent` could print a hint when `:only` names one namespace of a `project-tests` group: "also in this suite: …".

## Detection signal
- A transcript edits `dev/src/dev/kondo_ratchet.clj` (or anything in `mage.project-tests` groups), runs `test-agent :only` on a subset of the group, then pushes.
- A CI failure in "Project tests: Backend checks" right after such a push.

## Raw excerpts
```
L1259 [ASSISTANT] Found it — a real regression from my change, exactly the kind of thing the CI watch is for.

`check-reports-empty-unlimited-test` pins the lines `check` prints. The old drifted path threw *without* printing (its detail was already on screen via `run! println lines`), while the missing-file path printed *and* threw. My `fail!` unified both to print-and-throw, adding a line:

+ "…/ratchets.edn drifted from the source tree"
```
```
L1260 [TOOL Edit] dev/src/dev/kondo_ratchet.clj OLD=(defn- fail!
  "Print `message` and fail the babashka task, without mage's default stack trace."
  [message]
  (println message)
  (throw (ex-info message {:babashka/exit 1, :mage/quiet true}))) NEW=(defn- exit!
  "Fail the babashka task with `message`, without mage's default stack trace."
  ...
(defn- fail!
  "[[exit!]], for a `message` the run has not already printed."
```
