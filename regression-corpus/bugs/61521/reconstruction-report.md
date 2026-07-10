# Reconstruction report — metabase#61521 (FE)

_Verbatim final report from the FE reconstruction agent (a5916fd4727e11759)._

---

Working tree is clean and restored. This is an honest negative. Here is my report.

## Reconstruction outcome: `reconstruction_failed`

### Category: `no_unit_oracle__real_oracle_cypress`

The two named oracle specs do **not** discriminate this bug's behavior. The genuine behavioral fix is validated only by a Cypress e2e test.

### 1. Analysis of the fix commit (`8bd9ea4b`)

The commit has two distinct kinds of change:

- **Mechanical arity change** (what the named specs actually reflect): the `datasets: Record<string, Dataset>` parameter was removed from `combineWithCartesianChart`, `combineWithPieChart`, and `addColumnToPieChart`. Every edit to `cartesian.unit.spec.ts` and `pie.unit.spec.ts` in the commit is purely the removal of the now-unused `{}` positional argument — **no new behavioral assertions were added**.
- **The real behavioral fix**: a new helper `updateVizSettingsWithRefs` (in `frontend/src/metabase/visualizer/utils/update-viz-settings-with-refs.ts`) plus a new block at the end of `combineWithCartesianChart` that remaps a card's `column_settings` onto the new `COLUMN_N` refs so per-metric formatting (e.g. `number_style: "percent"`) survives when a second datasource is added. This is exercised only by the new Cypress spec `e2e/test/scenarios/dashboard/visualizer/reproductions.cy.spec.ts` ("should preserve column settings when use visualizer (metabase#61521)").

### 2. Oracle spec + baseline vs reconstructed `Tests:`

Discriminating semantic revert attempted = deleting the `if (vizSettings && vizSettings.column_settings) {…}` remap block from `combineWithCartesianChart` (the exact behavioral fix).

- **Baseline** (`cartesian.unit.spec.ts` + `pie.unit.spec.ts`): `Tests: 1 skipped, 49 passed, 50 total` — PASS
- **After semantic revert**: `Tests: 1 skipped, 49 passed, 50 total` — still **PASS** (green)

Confirmed empirically: removing the behavioral fix leaves both named oracle specs green. Neither spec ever passes a `vizSettings` argument (it defaults to `null`), and neither asserts anything about `state.settings.column_settings` (verified: zero matches for `column_settings`/`vizSettings`/`number_style` in either file). Their assertions only cover `graph.metrics`/`graph.dimensions`/`columnValuesMapping` merging, which the bug does not affect.

### 3. failure_shape
None achievable against the named oracles. A minimal semantic revert produces **no assertion failure** in `cartesian.unit.spec.ts` or `pie.unit.spec.ts`. The only ways to make those specs fail would be the mechanical arity revert (re-add the `datasets` param → argument-shift crash), which is explicitly disallowed (`git apply -R` / arity/moved-target).

### 4. Confidence + adversarial reasoning
**High confidence** this is a true honest-negative for the named specs. Adversarial checks performed: (a) grepped both spec files for `column_settings`, `vizSettings`, `number_style`, `percent`, `updateVizSettings` — none present; (b) inspected all 7 `combineWithCartesianChart` call sites in the spec — all 4-arg, none supply viz settings; (c) empirically deleted the fix block and reran — specs stayed green; (d) restored via `git checkout`, working tree clean.

### 5. Where the bug IS reconstructable (reconstructable? = yes, but not via named oracles)
- **Real oracle = Cypress**: `e2e/test/scenarios/dashboard/visualizer/reproductions.cy.spec.ts` — asserts the unformatted axis values (`0.06`/`0.05`/`0.04`) do not appear after adding the second datasource, which only holds when `column_settings` are remapped.
- A secondary genuine unit oracle exists but was **not** in the provided list: `frontend/src/metabase/visualizer/utils/update-viz-settings-with-refs.unit.spec.ts` directly tests the new `updateVizSettingsWithRefs`/`updateVizSettingsKeysWithRefs` helper. It tests the extracted utility in isolation, not the `combineWithCartesianChart` integration point where the user-visible bug actually lived, so it is not a faithful oracle for "the bug's behavior" either.

Recommendation: mark this bug's unit-reconstruction as `reconstruction_failed` / `no_unit_oracle__real_oracle_cypress`. No thrashing performed; single semantic revert tested and reverted.
