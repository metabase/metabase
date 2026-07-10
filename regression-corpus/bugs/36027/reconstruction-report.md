The worktree diff is clean — only the semantic revert in `graph.ts`, spec restored. Here is my report.

---

## 1. git diff — the semantic revert

Applied to `frontend/src/metabase/visualizations/lib/settings/graph.ts` (worktree, left in place). Both `GRAPH_DATA_SETTINGS["graph.dimensions"].isValid` and `["graph.metrics"].isValid` reverted from the fix's empty-recalc guard back to the pre-fix `getAreDimensionsAndMetricsValid(series)` unconditionally. This reintroduces bug #36027: an empty stored `graph.dimensions`/`graph.metrics` (`[]`) is treated as vacuously valid, so the settings pipeline (`settings.ts:135-136`) keeps the empty value instead of recomputing defaults — the chart never recovers its axes after query clauses are removed.

## 2. Oracle

- **Shipped jest spec:** `frontend/src/metabase/dashboard/components/AddSeriesModal/AddSeriesModal.unit.spec.tsx`, test *"shows chart settings error message for incomplete charts"* — genuinely discriminating (it exercised the exact `isValid` path via a single Date-column card).
- **Status:** DELETED. The whole `AddSeriesModal/` component + spec were removed by the visualizer feature branch #48527 (`5a00c58b322`, `818 deletions`). No relocated/renamed descendant exists.
- **Product logic:** SURVIVES — `graph.js` → `graph.ts`, `isValid` intact at lines 114-121 / 214-221.
- **Cypress repro:** SURVIVES — `describe("issue 36027")` / `metabase#36027`, relocated from `reproductions-3.cy.spec.js` to `e2e/test/scenarios/question-reproductions/reproductions-4.cy.spec.js`.
- **Over-revert probe (from worktree root):** `bun run test-unit-keep-cljs` on the 7 most-plausible surviving specs (`graph.unit.spec.ts`, `visualization.unit.spec.ts`, `Visualization.unit.spec.tsx`, `cartesian-chart.unit.spec.ts`, `ChartSettingFieldPicker`, `ChartNestedSettingSeriesSingle`, `Dashcard`). **Baseline: 120 passed. Reconstructed (aggressive over-revert): 120 passed — ZERO trips.** `visualization.unit.spec.ts` is the only surviving spec that even invokes the consuming pipeline (`getComputedSettingsForSeries`), and it stays green.

## 3. failure_shape

No surviving jest spec fails. To confirm the revert is a real (closable) behavioral regression I injected a throwaway test into `visualization.unit.spec.ts` calling `getComputedSettingsForSeries` on a bar card with stored `{"graph.dimensions":[], "graph.metrics":[]}` and valid `[DateTime col1, Number col2]` data:
- Mutated code: `expect(settings["graph.dimensions"]).toEqual(["col1"])` → **Received `[]`** (clean value mismatch, not a compile error).
- Clean HEAD: same test **passes** (`["col1"]`/`["col2"]`).
The throwaway test was removed; the final worktree diff is `graph.ts` only.

## 4. Confidence + adversarial

High confidence this is a genuine hole, not a blunt break. The over-revert compiles and leaves all 120 sibling tests green — the neutralization only changes behavior on the narrow "empty stored setting + defaults available" branch, which no surviving unit test asserts. The one spec touching the pipeline (`visualization.unit.spec.ts`) covers `stackable.stack_type`, histograms, y-axis titles, `pie.*`/`map.*` defaults — never the empty dimensions/metrics recalc. The bug's discriminating jest coverage was deleted wholesale with the AddSeriesModal component; nothing replaced it.

## 5. Outcome

**reconstruction_failed — category: cypress_only.** The product logic survives and is cleanly revertable, but the only surviving regression protection is the Cypress e2e test (`reproductions-4.cy.spec.js`, `metabase#36027`); the discriminating jest spec was removed by the #48527 visualizer refactor and has no descendant.

**Closable with a new unit test: YES (proven).** A colocated jest test in `visualization.unit.spec.ts` asserting `getComputedSettingsForSeries` recalculates empty `graph.dimensions`/`graph.metrics` to the default columns flips exactly (`["col1"]`/`["col2"]` on fixed vs `[]` on buggy) and needs no rendering/mocking — a cheap, stable replacement for the deleted AddSeriesModal coverage.