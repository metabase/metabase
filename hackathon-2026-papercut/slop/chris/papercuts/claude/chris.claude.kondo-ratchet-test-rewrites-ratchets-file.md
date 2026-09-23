---
title: Running the kondo ratchet tests locally silently rewrote .clj-kondo/ratchets.edn (test fixture called fix!)
slug: kondo-ratchet-test-rewrites-ratchets-file
kind: codebase-trap
impact: both
severity: medium
status: fixed
area: dev/test/metabase/core/kondo_ratchet_test.clj, dev/src/dev/kondo_ratchet.clj, CLAUDE.md "Kondo Ignore Ratchets", mage project-tests
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 6-366
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.80, misleading_signal: 0.64, user_correction: 0.79, codebase_trap: 0.82, flailing: 0.31, env_friction: 0.67}
---
## Summary
Until PR #81776 (branch `beguild-30-explicit-shrink`, 2026-09-02), `metabase.core.kondo-ratchet-test` had a `:once` fixture that called `kondo-ratchet/fix!` whenever `CI` was not the literal string `"true"`. So `./bin/mage project-tests` (and the `ratchets` suite) rewrote `.clj-kondo/ratchets.edn` in the working tree *before* asserting on it. The local test was also strict (exact match) while CI was at-most-N. An agent that "ran the checks" got an unrequested diff in the file every PR conflicts on, and CLAUDE.md told agents to run exactly that command. The user caught it and the session redesigned the whole ratchet surface.

## Symptom
- A local run of the repo checks leaves `.clj-kondo/ratchets.edn` modified. Agents commit it ("lowered budgets") on feature branches, which is the thing master's shrink automation is meant to own and which causes conflicts.
- The old failure message admitted the circularity: "Too high in a local run means `fix!` itself is broken, since the test fixture just ran it."
- CLAUDE.md said to run bare `./bin/mage project-tests` for "module, ratchet, and migration checks", and described "Development enforces the file exactly, while CI rejects only over-budget suppressions" as a standard to meet.

## Timeline
- L6 user: "we recently made some changes so that the kondo ratchet tests pass if there's 'slack' in the counts ... on feature branches we don't need to be running the shrink command ... i want to see if there are any lingering prompts in claude.md or skills ... giving outdated guidance".
- L59-60 agent reads the fixture: `;; Local tooling sets CI=false and CI=, and both are truthy when tested for presence. (defn- ci? [] (= "true" (System/getenv "CI")))` and `(use-fixtures :once (fn [thunk] (when-not (ci?) (kondo-ratchet/fix!)) ...`.
- L103/L121 agent first only patches CLAUDE.md, telling agents to avoid the bare `project-tests` because it "rewrite[s] `.clj-kondo/ratchets.edn` in place".
- L125 user: "i think you can run just those particular tests through mage too?" (agent had invented a two-command workaround instead of finding the `ratchets` suite in bb.edn:285).
- L145 user: "i think shrinking the ratchets should always be an explicit action - maybe a flag to the mage task, and not done when running the test".
- L177-205 agent removes the fixture's `fix!`, collapses dev/CI to at-most-N (`over-budget` everywhere), deletes the now-vacuous `no-stale-exemptions-test`.
- L347-617 renames tasks: `fix-kondo-ratchets` -> `kondo-ratchets-shrink`, `check-kondo-ratchets` -> `kondo-ratchets`, `merge-kondo-ratchets` -> private `-kondo-ratchets-merge`; moves justification check into bb `check-report`; CI runs `./bin/mage kondo-ratchets`.
- L1389-1500 follow-on: user asks "since when did shrink remove comment-exempt entries? not sure we want that" -> shrinker stops dropping `:comment-exempt` entries (same "decision not count" rule as `:unlimited`).

## Root cause
A check with a hidden side effect: the JVM test fixture ran the fixer before asserting, gated on an env var that local tooling sets inconsistently (`CI=false`, `CI=`). The asymmetric dev/CI semantics were described in CLAUDE.md as the rule, so agents treated a rewritten budget file as expected output to commit.

## Why agents fall for it
"Run the tests" is the default verification step, and the test passing after rewriting the file looks like success. Nothing in the test name says it mutates the tree. CLAUDE.md actively pointed at the mutating command.

## Current state
Fixed on master. `dev/test/metabase/core/kondo_ratchet_test.clj` no longer has a `use-fixtures` that calls `fix!` (only unit tests of `fix!` at :336-448). `bb.edn:313` `kondo-ratchets` (read-only check) and `bb.edn:319` `kondo-ratchets-shrink` (the only mutator). Memory `project_kondo_ratchets.md` updated in-session. The project CLAUDE.md "Ratchets" section now says "Do not record reductions in feature PRs: post-merge automation opens a `Tighten ratchets` PR".

## Suggested fix
Done. General rule worth a lint/test: test fixtures must not write tracked files (a `git status --porcelain` before/after assertion in the project-tests runner would catch any regression).

## Detection signal
- Transcript: a test/check command followed by `git status` showing a tracked config file modified that the agent never edited.
- Hook: after `./bin/mage project-tests` or `test-agent`, diff tracked files; warn if anything outside the agent's edits changed.

## Raw excerpts
```
L336 [ASSISTANT] ... the `:once` fixture called `kondo-ratchet/fix!` on every non-CI run, so `./bin/mage project-tests ratchets` rewrote `.clj-kondo/ratchets.edn` in your tree before asserting. That's gone.
Removing it forced the second half: with the auto-fix gone, the local-only strict mode would have failed every branch that removes an ignore ... So the `ci?` split went too.
L344 [ASSISTANT] ... A check that edits the thing it's checking isn't a test, it's a fixer with an assertion stapled on. The old code admitted this — the failure message read "Too high in a local run means `fix!` itself is broken, since the test fixture just ran it."
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-master-only/c9045469-07ff-4c1b-9aa3-3409dcf38ae9.jsonl
  lines: 335-351
  date: 2026-08-26
  jev: {self_inflicted_bug: 0.84, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.43, codebase_trap: 0.84, flailing: 0.49, env_friction: 0.81}

Hit while testing PR #81033 ("Use kondo ratchets on master only"). The agent simulated the "accidental deletion on master" state (`rm` the marker, `mv .clj-kondo/ratchets.edn /private/tmp/ratchets.edn.bak`) and ran `./bin/test-agent :only '[metabase.core.kondo-ratchet-test]'`. The test failed as intended, but the `:once` fixture's `fix!` also wrote a fresh, empty budgets file into the working tree:

- L339-340: `FAIL in metabase.core.kondo-ratchet-test/budgets-match-actual-counts-test (kondo_ratchet_test.clj:35) expected: {}`
- L343 ASSISTANT: "Restoring the working tree — the fixture regenerated an empty budgets file during that test."
- L344: `cp /private/tmp/ratchets.edn.bak .clj-kondo/ratchets.edn` then `git diff --quiet ... && echo "ratchets.edn restored, matches HEAD"`.

The agent had made a backup and caught it. Without the backup, the test would have replaced the real file with an empty one on a branch whose whole point was the file's presence or absence. The side effect is worst in exactly the edge-case tests that someone writes to check this logic.

Also at L481 of `.../metabase-kondo-ratchets/399c72ad-11ba-4e3c-b69a-f89e28e338fd.jsonl`, the test printed `unchanged` (the fixture's `fix!` output) before the FAIL line. This is the same fixture seen from the other side.
