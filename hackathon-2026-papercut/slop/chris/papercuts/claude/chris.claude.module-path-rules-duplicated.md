---
title: The module name → namespace prefix → source directory rule is copied into many places (mage, dev.deps-graph, module explorer, test runner, sort order), so a new module kind needs a hunt
slug: module-path-rules-duplicated
kind: codebase-trap
impact: both
severity: medium
status: documented-still-hit
area: mage/src/mage/modules.clj, dev/src/dev/deps_graph.clj, dev/src/dev/module_explorer.clj, test/metabase/test_runner.clj, dev/src/dev/modules_config.clj, dev/test/metabase/core/modules_test.clj, .clj-kondo/src/hooks/common/modules.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 5960-6370
    date: 2026-09-17
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.52, misleading_signal: 0.50, user_correction: 0.89, codebase_trap: 0.78, flailing: 0.34, env_friction: 0.73}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 7396-7483
    date: 2026-09-17..20
    jev: {self_inflicted_bug: 0.88, tool_misuse: 0.95, misleading_signal: 0.48, user_correction: 0.87, codebase_trap: 0.52, flailing: 0.26, env_friction: 0.83}
---
## Summary
Adding a new kind of module (`module/embedder`, a plugin in `modules/embedder/`) meant editing the same
rule in 6+ places. The rule maps a module to its ns-prefix, its source/test folder, and its sort order.
Each copy hard-codes the two existing roots, `metabase.` → `src|test/metabase` and
`metabase-enterprise.` → `enterprise/backend/...`. The agent found them one at a time: from failing
tests, from a CODEOWNERS diff, from a smoke run of `modules-tree`, and finally from a roborev review
that found three more. The dev-side sort function says in its docstring that it "Mirrors the test's
`sort-module-names`". It is a hand-kept copy of the test's function.

## Symptom
A stream of follow-up edits and failures after the "main" change:
- L6042-6058 the config test `modules-should-be-sorted-by-name-test` enforces an order that `dev.modules-config` duplicates. Both had to change.
- L6100 "my earlier edit left Cam's TODO above the wrong definition, and the test runner's module folders need the same `module/X` rule."
- L6146 CODEOWNERS out of date; mage tests then ERROR in `driver-triggers-driver-tests` etc. (L6148) because `direct-dependents` did `(contains? :any module)`.
- L6257 `mage modules-tree` printed the plugin as plain `embedder`; `dev.module-explorer/module->tree-path` needed its own change.
- L6355 "Several spots need the new prefix: the namespace-naming lint, the resolver's default and fallback, mage's file mapping, and the test-folder helpers in `dev.deps-graph` and the explorer."
- L6369 "Rather than patch four copies of the same path logic, I'll put one `module-directory` function in `hooks.common.modules`".
- L7396-7483 roborev 6000 still found three gaps: files resolved by namespace not folder, `:uses :any` inside a plugin, and `dev.deps-graph/file->namespace` dropping plugin tests from CI test selection.

## Timeline
- L5978 user picks `module/embedder`; agent begins rename.
- L6003-6034 resolver + tests; L6034 unbalanced paren in new test found only at L6203 (cold run).
- L6041-6058 sort order in two files.
- L6068-6081 `dev.deps-graph` plugin roots (needs `declare kondo-config`).
- L6084-6109 mage + `test_runner/module-folders` + its test.
- L6145-6158 CODEOWNERS regen; mage bug on `:any`.
- L6250-6262 explorer tree path.
- L6281 user correction: "i don't think that embeddings.embedder can move to modules, because it's a hard dependency isn't it?" The old dotted name `enterprise/search.embeddings.embedder` made the plugin look like a child of `search.embeddings`, but the two had no code relationship (L6297).
- L6346 user switches the prefix to `metabase-module`; L6351-6369 agent greps every `metabase-enterprise` special case and consolidates into `module-directory`.
- L7403-7483 fixes for roborev 6000's three findings.

## Root cause
No single source of truth for "where does module X live on disk" and "how are modules ordered". Each
tool (kondo hook, mage bb, dev JVM tools, test runner) re-derived it from the prefix string.

## Why agents fall for it
- Each copy is small and looks local (`(when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")`).
- The tests cover each copy separately, so the first green run hides the others.
- Some copies run under bb and some under the JVM, so "just require the hook" is not obvious. (It works: bb.edn already puts `.clj-kondo/src` on the path.)

## Current state
Still duplicated on the current checkout (module-plugins work not merged):
- `mage/src/mage/modules.clj:67` `(str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/") ...`
- `dev/src/dev/deps_graph.clj:735` same expression
- `dev/src/dev/module_explorer.clj:42` same expression
- `test/metabase/test_runner.clj:112` same expression
- `dev/src/dev/modules_config.clj:46` `sort-module-names` "Mirrors the test's `sort-module-names`" / `dev/test/metabase/core/modules_test.clj:89`
Documented in memory `project_module_plugins.md` ("Places that encode the prefix/directory rules
(roborev found the hidden ones)"), which also lists `src/metabase/util/log.clj`,
`dev.kondo-ratchet/plugin-source-roots`, `deps.edn :kondo/all`, `mage.quick-test-runner`, and the
ns-name kondo hook. That memory was written after this session, so the note came after the hunt.

## Suggested fix
- One `module-directory` / `module-test-directory` function in `hooks.common.modules` (loadable from bb
  and the JVM), used by mage, dev.deps-graph, the explorer, and the test runner.
- The test should call the same `sort-module-names` as `dev.modules-config`, not keep a copy.
- Add a consistency test: for every module in config, every namespace that resolves to it lives under
  `module-directory`. The branch added `plugin-namespaces-live-in-their-plugin-directory-test`; generalise it.

## Detection signal
- Grep hit count for `"metabase-enterprise."` string literals in dev/mage/test tooling > 1.
- A session that edits `.clj-kondo/src/hooks/common/modules.clj` and then fails in mage or test-runner tests about folders.

## Raw excerpts
```
L6048 [RESULT] ;;;; Ordering — must match `metabase.core.modules-test`
(defn- sort-module-names
  "Sort module symbols with `enterprise/` modules last. Mirrors the test's `sort-module-names`."
L6357 [RESULT] (defn- module->test-path-prefix [modules-config module]
  (let [ns-prefix (modules/module-ns-prefix modules-config module)]
    (str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")
         "test/"
         (-> ns-prefix (str/replace "." "/") (str/replace "-" "_")))))
L6369 [ASSISTANT] Rather than patch four copies of the same path logic, I'll put one `module-directory` function in `hooks.common.modules`, which all of these already load.
L7396 [ASSISTANT] Review 6000 on `module-plugins` ... raised three findings. All three are real ...
  1. A mismatched plugin file is resolved by namespace, not by folder ...
  3. ... plugin tests would be silently dropped ... The fix goes in `file->namespace`
```
