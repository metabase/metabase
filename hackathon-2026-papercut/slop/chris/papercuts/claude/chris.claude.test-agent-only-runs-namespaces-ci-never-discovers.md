---
title: test-agent :only runs a dev.* test namespace green, but CI's discovery (namespace-pattern ^metabase|hooks, dev dirs excluded) never runs it
slug: test-agent-only-runs-namespaces-ci-never-discovers
kind: test-harness
impact: introduced-bug
severity: medium
status: open
area: test/metabase/test_runner.clj, bin/test-agent, dev/src, dev/test
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/26fde2ad-8bfb-4ad4-87bf-7b539ddf6e82.jsonl
    lines: 66-220
    date: unknown (PR #80618 / #80720)
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.84, misleading_signal: 0.49, user_correction: 0.64, codebase_trap: 0.81, flailing: 0.33, env_friction: 0.77}
---
## Summary
Addressing a Copilot comment on PR #80618, the user said "test should move too" (alongside `dev.hierarchy-visualization`). The agent found that the runner's discovery excludes `dev` directories and only matches `^metabase.*|hooks\..*` namespaces, noted that a `dev.hierarchy-visualization-test` "won't be auto-discovered regardless of where it lives", and moved it to `dev/src/dev/` anyway. It then verified with `./bin/test-agent :only '[metabase.util.ordered-hierarchy-test dev.hierarchy-visualization-test]'`, which ran all 8 tests green, because `:only` bypasses the discovery filter. It committed and pushed. The move made the tests invisible to CI. After a user correction it reverted to `test/metabase/util/` under a `metabase.*` ns requiring the dev ns (the precedent set by `metabase.core.modules-test` requiring `dev.deps-graph`). roborev independently flagged the CI-discoverability problem on the intermediate commit.

## Symptom
Local verification passed (`Ran 8 tests in parallel ... All tests passed.`) for a test CI would never run. The only warning was kondo's "All tests must live in a known module; nil is not a known module", which the agent dismissed as pre-existing on every `dev.*` test ns.

## Timeline
- L66 user: "1. test should move too."
- L69-111: agent inspects `deps.edn` extra-paths and `test_runner.clj` excluded-directories.
- L120 agent: "the test runner excludes `dev` directories *and* filters namespaces to `^metabase.*|hooks\..*`, so once the ns becomes `dev.hierarchy-visualization-test` it won't be auto-discovered regardless of where it lives. `dev/test` isn't on any classpath ... so I'm putting it in `dev/src/dev/` — precedent `dev/src/dev/private_things_test.clj`".
- L121 `git mv test/metabase/util/hierarchy_visualization_test.clj dev/src/dev/hierarchy_visualization_test.clj`
- L148-149 `./bin/test-agent :only '[... dev.hierarchy-visualization-test]'` -> `{:test 8, :pass 24, :fail 0 ...} All tests passed.`
- L152-153 kondo: `warning: All tests must live in a known module; nil is not a known module`.
- L182: "CI's kondo doesn't lint `dev/` at all, and that warning is pre-existing on every `dev.*` test ns, so it's not a new problem. Committing"; pushed at L194.
- L218 (after user pushback): "`metabase.core.modules-test` requires `dev.deps-graph` ... Both keep a `metabase.*` ns under `test/` precisely so the runner discovers them ... My move made the test invisible to CI, which is strictly worse. Reverting it".
- L307: roborev's only finding on the intermediate commit was the CI-discoverability problem.

## Root cause
Two discovery paths disagree. CI's `find-and-run-tests-cli` discovers by directory (excluding `dev`) and namespace pattern. `:only` names namespaces directly and loads them from the classpath, so anything on the classpath passes locally. Precedent files (`dev/src/dev/private_things_test.clj`, `dev/test/dev/*_test.clj`) make `dev.*` tests look legitimate even though nothing runs them.

## Why agents fall for it
"I ran it and it passed" is the strongest local signal, and it's wrong here. The misleading precedents exist in the tree. The kondo warning is noisy and pre-existing.

## Current state
Still present on master (d3a5a218a55):
- test/metabase/test_runner.clj:81-92 `excluded-directories` includes `"dev"`; :99 `:namespace-pattern #"^(?:(?:metabase.*)|(?:hooks\..*))"`.
- bin/test-agent:5-6 now puts `dev/test` on the path (`:dev/test`) "so the project-level checks under dev/test/metabase/core are runnable with :only" — the same bypass.
- deps.edn:708-711 admits `;; dev/test namespaces that no longer load; nothing runs them  dev.deps-graph-test dev.migrate-test dev.model-tracking-test`.
- dev/test/dev/ still holds debug_qp_test.clj, deps_graph_test.clj, migrate_test.clj, model_tracking_test.clj, modules_config_test.clj, n_plus_one_detection_test.clj.
Not documented in CLAUDE.md or memories.

## Suggested fix
- Make test-agent warn (or fail) when an `:only` namespace doesn't match the CI namespace-pattern / directory filter: "this namespace is not discovered by CI".
- Or make the kondo "All tests must live in a known module" warning an error for `deftest` in `dev.*` namespaces, with a message pointing at the `metabase.*`-ns-requires-dev-ns pattern.
- Delete or rename the orphaned `dev.*` tests so there is no precedent.
- One line in CLAUDE.md "Running Backend Tests": "CI only discovers `metabase.*`/`hooks.*` namespaces outside `dev/`; `:only` runs anything, so a green `:only` run does not prove CI runs the test."

## Detection signal
- `bin/test-agent :only` argument containing a namespace not matching `^(metabase|hooks)\.`.
- `git mv` of a `*_test.clj` into `dev/`.
- kondo output "nil is not a known module" on a test file in the diff.

## Raw excerpts
```
L149 Running tests with options {:mode :cli/ci, :namespace-pattern #"^(?:(?:metabase.*)|(?:hooks\..*))", :exclude-directories [".clj-kondo/src" "classes" "dev" ...], ... :only [metabase.util.ordered-hierarchy-test dev.hierarchy-visualization-test]}
     {:test 8, :pass 24, :fail 0, :error 0, :type :summary, :duration 24.659417, :parallel 8}
     All tests passed.
L153 dev/src/dev/hierarchy_visualization_test.clj:14:1: warning: All tests must live in a known module; nil is not a known module
```
