The reconstruction is complete. Here is my final report.

## FE semantic-reconstruction report — issue 54271

### 1. git diff (the semantic revert)
Applied to current product code `frontend/src/metabase/visualizations/lib/renderer_utils.ts` in `getXValues`, reintroducing the exact bug the fix guarded against (the fix added the `value != null` guard around `uniqueValues.add`):

```diff
       lastValue = value;
-      if (value != null) {
-        uniqueValues.add(value);
-      }
+      uniqueValues.add(value);
```

This is a full neutralization of the fix (the entire guard removed), i.e. an aggressive over-revert.

### 2. Oracle
- **Spec:** `frontend/src/metabase/visualizations/lib/renderer_utils.unit.spec.ts` (the surviving `.js`→`.ts` relocated descendant of the shipped `renderer_utils.unit.spec.js`; discriminating test `"should exclude values that cannot be parsed according to the column type"` at line 220, ported verbatim from the fix commit).
- **Command:** `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/lib/renderer_utils.unit.spec.ts` (run from worktree root).
- **Baseline (clean HEAD):** Tests: 19 passed.
- **Reconstructed (mutated):** Tests: 19 passed — **oracle did NOT flip.**

### 3. failure_shape
None. No jest assertion fails. The mutation causes `getXValues` to add `null` (returned by `parseXValue` for the unparseable `"abc"` date) into the output array, but the current TS test filters it out before asserting.

### 4. Confidence + adversarial
High confidence this is a true negative. The discriminating test **drifted to non-discriminating** during the `.js`→`.ts` migration:
- **Original `.js` spec:** `xValues.map(v => v.format("YYYY-MM-DD"))` — a leaked `null` would throw `TypeError: Cannot read properties of null`, catching the bug.
- **Current `.ts` spec:** `xValues.filter((value): value is Dayjs => isObject(value) && "format" in value).map(...)` — the added Dayjs type-guard filter silently strips the leaked `null` before formatting, so the assertion `["2019-01-02","2019-01-03"]` still holds.

The guard's only live effect is on the unparseable-input path: actual-`null` rows are pre-filtered at line 120 (`canDisplayNull`) before ever reaching `uniqueValues.add`, so the sibling "should exclude nulls for timeseries/histogram/ordinal" tests never exercised this guard and stay green regardless. `getXValues` is referenced by exactly one jest spec (verified via grep across `frontend/src` + `enterprise/frontend/src`), so no other unit test catches the leak. The full spec file passes (19/19) with the guard entirely removed — confirming ZERO jest specs trip.

### 5. Outcome
**reconstruction_failed — category: cypress_only.** The only effective regression protection at HEAD is the Cypress e2e test `describe("issue 54271")` in `e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.js` (asserts the app doesn't crash rendering a line chart with a broken date column). The jest descendant exists and exercises the changed function but is non-discriminating due to migration drift.

**Closable with a unit test: YES — trivially.** This is a stronger-than-usual cypress_only: the fix's jest coverage isn't missing, just defeated by a one-line drift. Reverting the test's `.filter(...is Dayjs...)` back to a direct `.map(v => v.format(...))` (or asserting `xValues.length === 2` / that no `null` is present) restores a hard value assertion that flips on this exact mutation, making it a clean kill.

The mutation diff is left in the worktree for capture.