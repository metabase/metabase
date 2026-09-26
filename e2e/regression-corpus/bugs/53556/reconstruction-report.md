# Reconstruction report — metabase#53556

_Verbatim final report from the worktree-isolated reconstruction agent (a59279a7e485cfceb)._

---

Reconstruction complete and verified. Here is the report.

## 1. Reconstruction `git diff`

```diff
diff --git a/src/metabase/lib/card.cljc b/src/metabase/lib/card.cljc
@@ -333,4 +333,4 @@
 (mu/defn source-card-is-model? :- :boolean
   "Is the query's source-card a model?"
   [query :- ::lib.schema/query]
-  (= (source-card-type query) :model))
+  (= (source-card-type query) :never-a-model))
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a59279a7e485cfceb/src/metabase/lib/card.cljc` (single line, single function).

**Why this is a semantic revert, not `git apply -R`:** the fix commit added `source-card-is-model?` as `(= (source-card-type query) :model)`, and the surrounding code has since drifted (`source-card-type` now uses `lib.metadata.calculation/primary-source-card` instead of the original `lib.util/source-card-id` + `lib.metadata/card`). I left the drifted `source-card-type` intact and inverted only the model-detection predicate by comparing against a sentinel keyword `source-card-type` can never return — making "is the source card a model?" answer *never*, which is exactly the pre-fix state (models were never recognized as model-mapped by the drill layer).

## 2. Oracle

- **Namespace/tests:** `metabase.lib.card-test/source-card-is-model?-test` (primary oracle) and `metabase.lib.card-test/source-card-type-test`.
- **Baseline (pristine current code):** 2 tests, **6 assertions, 0 failures, 0 errors — All tests passed.**
- **Reconstructed:** 2 tests, **6 assertions, 1 failure, 0 errors.**
  - `source-card-is-model?-test` **FAILS** at `card_test.cljc:308`: `expected: (lib.card/source-card-is-model? (lib.tu/query-with-source-model))` / `actual: (not (... :source-card 1 ...))` — a model source card is no longer recognized as a model.
  - `source-card-type-test` still **PASSES** (change is localized to the derived predicate, not the type accessor) — demonstrates surgical localization.

## 3. Failure shape

- **symptom:** `source-card-is-model?` returns `false` for a query whose source card is a model. Downstream, `possible-model-mapped-breakout-column?` (`src/metabase/lib/drill_thru/common.cljc:119`, its only consumer) gates on `model-sourced?`, so `breakout->resolved-column` returns the breakout column unchanged instead of resolving it — reproducing bug #53556 (drills generate id-based field refs → SQL matching the underlying mapped column name rather than the model's native `AS`-renamed name).
- **repro_failure:** clean assertion `FAIL` (not a compile/load ERROR — 0 errors). The var still exists and type-checks (`:- :boolean` still satisfied by `false`), so the test loads and runs, then the assertion fails.

## 4. Confidence + adversarial reasoning

**Confidence: high.**

- The failure is an assertion `FAIL` with `0 errors`, not a load/compile error — the reconstruction did not merely break the namespace.
- The change is genuinely behavioral and semantic: it edits the drifted current code, keeps schemas valid, and inverts the fix's core insight ("recognize model source cards").
- It is faithful to the real bug, not an arbitrary test break: `source-card-is-model?` is consumed only by the drill gate `possible-model-mapped-breakout-column?`, confirmed at `drill_thru/common.cljc:119`. Forcing it false makes the drill code path behave exactly as pre-fix (column passed through unresolved), which is the #53556 defect. I chose the always-false sentinel over swapping `:model`→`:question` precisely to avoid the spurious "question-treated-as-model" behavior and match the true pre-fix state (models simply never detected).
- Localization is proven: `source-card-type-test` still passes, so the blast radius is confined to the one predicate the oracle discriminates.

## 5. Ambiguity

Minor: the oracle tests exercise the helper predicate directly rather than an end-to-end drill assertion, so the oracle proves the *root-cause behavioral change* (model non-detection) rather than the *observable SQL symptom*. This is acceptable and intended — the prompt named these two `card-test` deftests as the oracle, and the predicate is the single upstream gate for all eight drill files touched by the fix, so breaking it is the faithful common-cause reintroduction of the bug.
