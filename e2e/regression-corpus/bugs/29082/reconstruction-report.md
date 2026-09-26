The reconstruction is complete. Diff is left in the worktree. Here is my report.

---

## 1. git diff — the semantic revert

The bug's operator-determination logic (null cell → `is-null`/`not-null`) no longer lives in reachable JS. It migrated into Clojure (`src/metabase/lib/drill_thru/quick_filter.cljc`, `operators-for`). The only JS-reachable remnant of the null-drill fix is the FE title presentation in the TSX wrapper, which I over-reverted:

```
frontend/src/metabase/querying/drills/utils/quick-filter-drill.tsx
-  case "=": return { ...action, title: t`Is empty` };
-  case "≠": return { ...action, title: t`Not empty` };
+  case "=": return { ...action, title: operator };   // undifferentiated
+  case "≠": return { ...action, title: operator };
```

## 2. Oracle

- No discriminating jest spec exists. Nearest surviving jest spec in the folder: `frontend/src/metabase/querying/drills/utils/query-drill.unit.spec.ts`.
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/drills/` (run from worktree root).
- Baseline (clean HEAD): PASS — Tests: 4 passed.
- Reconstructed (over-revert applied): PASS — Tests: 4 passed. Zero specs tripped.

## 3. failure_shape

None. The mutation produces no jest assertion failure anywhere — there is no jest test that renders the quick-filter drill for a null cell or asserts its operators/titles.

## 4. Confidence + adversarial

Verified thoroughly. The shipped fix touched four files: the `29082` cypress spec, the drill product code (`quick-filter-drill.js`), `QuickFilterDrill.tsx`, and the jest spec `QuickFilterDrill.unit.spec.js`. All three of the last three are **deleted** — the drill was rewritten onto Metabase Lib. The discriminating jest spec (which had a real "numeric cells with null values" describe block asserting `is-null`/`not-null`) is gone. Greps for `quickFilterDrill`, `QuickFilterDrillThru`, `filterDrillDetails`, and any importer of the current `quick-filter-drill.tsx` return **zero** jest specs. The null operator-set decision now lives in CLJC `operators-for` (comment line 17: "For `null` value, allow only `=` and `≠`… which map to `is-null` and `not-null`") and is covered by the Clojure test `test/metabase/lib/drill_thru/quick_filter_test.cljc` — not a jest oracle, and not even visible to the `test-unit-keep-cljs` harness (precompiled cljs). An aggressive over-revert of the sole JS-reachable null branch tripped zero jest specs.

The regression itself is **still guarded**: the `29082` cypress test survived, relocated into `e2e/test/scenarios/question-reproductions/reproductions-2.cy.spec.js` (line 363, `describe("issue 29082")`, still asserting "Discount is empty" via `.test-TableInteractive-emptyCell`).

## 5. Outcome

**reconstruction_failed — category: cypress_only.**

The discriminating jest spec was deleted in the Metabase Lib migration; the bug's core logic moved to CLJC (Clojure-tested) and its only JS-land remnant (FE title presentation) has no jest coverage. Regression protection now = the surviving/relocated cypress `29082` test + the Clojure `quick_filter_test` — no jest oracle catches it.

**Closable with a new unit test:** partially. A jest spec could render the quick-filter drill via Lib for a null cell and assert the surfaced operators and the "Is empty"/"Not empty" titles (would catch the FE-presentation half). The deeper is-null/not-null operator-set decision is inherently a CLJC concern, best left to the existing Clojure test.