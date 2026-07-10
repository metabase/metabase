# Reconstruction report — metabase#47184

_Verbatim final report from the worktree-isolated reconstruction agent (afc5b2fab115737a6)._

---

Reconstruction succeeded. Here is the report.

## Semantic Reconstruction Report — metabase#47184

### (1) `git diff`
```diff
diff --git a/src/metabase/app_db/custom_migrations.clj b/src/metabase/app_db/custom_migrations.clj
@@ -1654,7 +1654,7 @@
   [outer-query]
   (loop [query (:query outer-query), i 0]
     (if-let [source-query (:source-query query)]
-      (recur source-query (inc i))
+      (recur source-query i)
       i)))
```
File: `/Users/fraser/Documents/code/metabase/src/metabase/app_db/custom_migrations.clj` (`last-stage-number`, private helper of the `AddStageNumberToParameterMappingTargets` migration).

### (2) Oracle test + results
- Namespace/test: `metabase.app-db.custom-migrations-test/set-stage-number-in-parameter-mappings-test` (`test/metabase/app_db/custom_migrations_test.clj:2327`)
- Baseline (worktree cwd confirmed): **PASS** — 2 assertions, 0 failures.
- Reconstructed: **FAIL** — 2 assertions, 1 failure, 0 errors.

### (3) failure_shape
Pure assertion failure (`=?` mismatch), not an error/exception. At `custom_migrations_test.clj:2412` ("After the migration, dimension parameter_mappings have stage numbers"): the multi-stage question's dimension targets are expected to carry `{:stage-number 2}` but now carry `{:stage-number 0}`. The forward migration ran cleanly; it just computed the wrong (pre-feature) stage number. Only the up-migration assertion flips — the down-migration assertion (line 2421) still passes because stripping stage-numbers is value-agnostic.

### (4) Confidence + adversarial reasoning
**High confidence.**
- The single change reintroduces the bug's *behavior*, not a mechanical `git apply -R`: the epic's mechanism here is `last-stage-number` descending the `:source-query` chain so a card's true last stage is recorded, enabling dashboard filters to target columns from *all* stages. Dropping the `(inc i)` makes every query look single-stage (`0`) — precisely the pre-epic world with no stage awareness. This migration was added in a sub-PR of the epic (#49256) and isn't in the shown top-level hunks, so this is a genuine semantic edit, not a reverse-patch.
- Failure is an assertion mismatch (0 errors), confirming the pipeline still compiles/runs — the fix's *effect* is what regressed.
- Baseline green was verified from the worktree root (`pwd` shows `.claude/worktrees/agent-...`), ruling out the false-negative cwd trap.
- Blast radius is contained: exactly one assertion flips; the reversal path is unaffected.

### (5) Ambiguity note
The prompt's hint ("likely `lib/stage.cljc` or `legacy_mbql/util.cljc`") did **not** pan out because those paths have drifted out from under their oracle tests:
- `with-filter-stage-test` moved to `test/metabase/parameters/custom_values_test.clj`, and `models/params/custom_values.clj` → `src/metabase/parameters/custom_values.clj` was **rewritten onto Lib/MBQL 5**. The old `:stage-number` nesting logic (`{:source-query inner-mbql}` keyed off `legacy-last-stage-number`) is gone; `:stage-number` is now an unused/ignored key (the options schema `::values-from-card-query.options` doesn't even declare it, and column resolution happens via `lib/visible-columns` at stage `-1`, which already exposes join columns). So that test passes via an unrelated mechanism and no longer localizes to a revertible product change.
- The `lib/stage.cljc` `ensure-filter-stage` / `legacy_mbql/util.cljc` `stage-path` changes feed the runtime filter-application path, not the migration oracle.

The migration oracle (`set-stage-number-in-parameter-mappings-test`) was the cleanest surviving target: its product code (`app_db/custom_migrations.clj`) is essentially undrifted, self-contained, and yields a crisp single-assertion failure. `reconstruction_failed` was not needed.
