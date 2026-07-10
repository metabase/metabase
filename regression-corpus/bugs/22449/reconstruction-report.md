# Reconstruction report — metabase#22449

_Verbatim final report from the worktree-isolated reconstruction agent (a69f868a1021b11cb)._

---

Reconstruction complete. Here is my honest report.

## 1. Oracle test chosen + why
`metabase.driver.sql.query-processor-test/multiple-counts-test` (#15074, "count of count grouping"). Chosen because it is the smallest/cleanest SQL-compile assertion: a single expected native-SQL string where the only load-bearing token is the outer aggregation alias `COUNT(*) AS "count_2"` (uniquified because a breakout column is also literally named `count`). The behavior traces to exactly one product function: `aggregation-name`, which supplies the `AS` alias in `apply-top-level-clause [:sql :aggregation]`.

## 2. Reconstruction `git diff`
File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a69f868a1021b11cb/src/metabase/driver/sql_mbql5.clj`
```diff
 (defmethod sql.qp/aggregation-name :sql-mbql5
   [_driver inner-query ag-clause]
-  (or (::add/desired-alias (lib/options ag-clause))
-      (:name (lib/options ag-clause))
-      (lib/column-name inner-query ag-clause)))
+  (lib/column-name inner-query ag-clause))
```
This is the semantic inverse of the fix hunk, which in the fix commit lived in `legacy_helper_fns.clj` (`aggregation-name` gained the same `(or (::add/desired-alias …) (:name …) (column-name …))` preference). See drift note below.

## 3. Oracle ns/name + results
- ns/name: `metabase.driver.sql.query-processor-test/multiple-counts-test`
- Baseline (fix present): PASS — `1 assertion, 0 failures, 0 errors`
- Reconstructed (fix reverted): FAILS — `1 assertion, 0 failures, 1 error`
- Run command (note `--oss` required; the full pipeline otherwise trips enterprise `apply-impersonation`, which needs a migrated app DB the harness doesn't seed → unrelated env error).

## 4. failure_shape
Thrown `ExceptionInfo` during `qp.compile/compile` (eftest `:error`, not a clean `=?` `:fail`). Root message: `Invalid input … ":source-table is not allowed in the top level of a query" / "should be :mbql/query, got: :mbql.stage/mbql"`.

## 5. Confidence + adversarial reasoning
**Confidence: medium — this is a qualified success, not a clean one.** Adversarial findings that a reviewer must weigh:

- **Drift is real and material.** The fix commit's actual hunk is in `metabase.query-processor.middleware.annotate.legacy-helper-fns/aggregation-name` (the legacy annotate path, whose `column-name` fallback receives a *full* mbql5 query and is safe). I verified that reverting *that* file does **not** flip the oracle: H2 now compiles via the newer `:sql-mbql5` path, added **after** the fix (commit `3728dbb5a51`, "Enable MBQL5 compilation for drivers"), which carries an equivalent copy of the guard. So the only way to flip the H2 compile is to revert the drifted `sql-mbql5` copy.
- **The failure is an `:error`, not the required clean assertion `:fail`.** In `:sql-mbql5`, `inner-query` is a *stage* (`:mbql.stage/mbql`), and `lib/column-name` requires a full `:mbql/query`. The `(or (::add/desired-alias …) (:name …) …)` branches normally short-circuit, so the `column-name` fallback is effectively dead. Removing the guard therefore does **not** reproduce the original "aggregation names not deduplicated" behavior (valid-but-wrong SQL with a colliding alias) — it makes `column-name` throw on a stage. The oracle catches it, but as a thrown exception rather than a SQL-string mismatch.
- Net: the test genuinely flips PASS→failing and the flip is directly and solely caused by removing the fix's guard, but it violates the task's "MUST fail as an assertion failure (not compile/load)" criterion, and its semantic fidelity to the original dedup bug is compromised by the drift.

## 6. Ambiguity / honesty note
I am classifying this as a **qualified reconstruction, not a full success**. A flip was achieved from one localized single-line hunk, but (a) it surfaces as `:error` not `:fail`, and (b) due to path drift it reintroduces a *crash* rather than the original *wrong-alias* behavior. The clean-assertion target the task wants isn't cheaply reachable here: the legacy hunk's own oracle (`aggregation-name-test`, only `[:count]`) doesn't flip (column-name already returns `"count"` on both code paths), and the other listed oracles (`multiple-breakouts-on-same-column-test`, `field-literals-test`, `desired-alias-should-respect-ref-name-test`) target the 997-line `add_alias_info.clj` rewrite or the new `:lib/ref-name` feature — heavy-rewrite drift I deliberately did not thrash on. If a strictly-clean `:fail` is required, I'd report this specific oracle as **reconstruction achieved-but-impure** and recommend against forcing a cleaner one within budget.

Working tree currently holds the reconstruction (the reverted `sql_mbql5.clj`); `legacy_helper_fns.clj` is restored to its fixed state. Only one file differs from HEAD.
