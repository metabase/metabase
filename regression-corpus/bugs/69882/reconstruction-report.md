# Reconstruction report — metabase#69882 (FE)

_Verbatim report (a6bcf8aaa466b343c)._

---

Reconstruction complete and verified.

## Report

**(1) `git diff`** — single-line semantic revert in `frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.ts`:
```diff
     const seriesKey =
       breakoutIndex == null
         ? getDatasetKey(column, cardId)
-        : getDatasetKey(column, cardId, untranslatedBreakoutValue);
+        : getDatasetKey(column, cardId, row[breakoutIndex]);
```

**(2) Oracle + results** — Oracle spec: `frontend/src/metabase/visualizations/echarts/cartesian/model/dataset.unit.spec.ts`
- Baseline: `Tests: 31 passed, 31 total`
- Reconstructed: `Tests: 1 failed, 30 passed, 31 total`
- The single failing test is the fix's added assertion: `"should use untranslatedRows for breakout dataset keys when present"`.

**(3) failure_shape** — Assertion failure (`toStrictEqual` mismatch). Dataset keys are derived from the *translated* breakout value (`2:type:Translated Type1`) instead of the stable untranslated value (`2:type:type1`) — exactly the bug's behavior ("content translations produce unstable translated keys in viz settings").

**(4) Confidence + adversarial reasoning** — High confidence.
- This is a true behavioral reintroduction, not `git apply -R`: I kept all the fix's scaffolding (`untranslatedRows` plumbing, `getRowsForStableKeys`, the `untranslatedBreakoutValue` computation and param) and only redirected the key-derivation back to the translated row value — the precise root cause the fix addressed.
- The failure is a clean assertion failure, not a compile/type/arity error. The `untranslatedBreakoutValue` param becomes unused but remains typed and passed, so no TS/arity breakage (verified: 30 other tests still pass, suite compiles).
- The change is localized to the one product change that this oracle spec exercises; I did not touch the other ~15 files (series.ts, pie.ts, sankey, boxplot, etc.), keeping the revert minimal and discriminating.

**(5) Ambiguity** — None. The oracle spec, the failing assertion, and the single product change form a clean 1:1 mapping. No honest-negative category applies (real unit oracle, non-deletion, no arity/moved/dead-target issues).
