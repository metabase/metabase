# Reconstruction report — metabase#56771 (FE)

_Verbatim final report from the FE reconstruction agent (a770e3365b584e61e)._

---

Baseline is clean (empty diff, 14/14 and 34/34 passing). I have enough to conclude. This is an honest-negative.

## Report: reconstruction_failed

**Bug:** metabase#56771 — column widths not re-applied after changing a query (e.g. joining a table adds columns). Fix commit `e53749f6` ("Fix column resizing").

### (1) git diff
None — working tree is clean. I performed and fully reverted all experiments; no product or spec files are modified.

### (2) Oracle specs — baseline vs. reconstructed
| Spec | Baseline | After full bug reintroduction |
|---|---|---|
| `DataGrid.unit.spec.tsx` | `Tests: 14 passed` | `Tests: 1 failed, 13 passed` — but the failure is `"unpins columns that exceed 90% of container width"`, a test **not touched by the fix commit** |
| `Dashcard.unit.spec.tsx` | `Tests: 34 passed` | `Tests: 34 passed` — the fix-modified assertion still passes |

### (3) failure_shape
No discriminating unit-assertion failure obtainable. The one unit failure I could force is collateral behavioral drift (`expect(pinnedHeaderCells).toHaveLength(1)` in an unrelated pinning test), not a fix-added/modified assertion.

### (4) Confidence + adversarial reasoning
**High confidence** this is a genuine honest-negative. Reasoning:

- **What the fix actually changed in the two unit oracles is non-behavioral:**
  - `Dashcard.unit.spec.tsx`: `screen.getByText(...)` → `within(visualizationRoot).getByText(...)`. This is a scoping adaptation to the refactored measurement (which renders hidden header/cell copies into a `document.body` container). Diagnostic proof: I instrumented the test with `expect(screen.getAllByText("NAME").length).toBe(1)` and it **passed** — no duplicates exist at assertion time in the drifted code, so the scoping is currently vestigial/robust. Reintroducing the bug does not add duplicates *inside* `visualization-root`, and the real grid always renders there, so the scoped assertions pass regardless.
  - `DataGrid.unit.spec.tsx`: the fix's only changes were type-level (`onColumnResize` signature `(columnSizingMap)` → `(columnName, width)`, and deleting a `type` alias). Jest runs via swc without type-checking, and **no runtime assertion in the spec exercises resize/`onColumnResize`**, so a signature revert cannot surface as an assertion failure.
  - `dataset.ts`: only added optional interface fields — reverting yields TS errors (consumed by `DATA_COLUMN_KEYS` in `useResetWidthsOnColumnsChange`), never a runtime jest failure.
- **Empirical falsification:** I applied a strong semantic revert of the fix's core runtime behavior in `use-data-grid-instance.tsx` (removed the two `useUpdateEffect`s that re-measure on controlled-width removal / new-column addition, restored the old single `setColumnSizingMap(controlledColumnSizingMap)` effect, and stripped the controlled-width preservation in `applyMeasuredColumnWidths`). Both fix-modified assertions still passed; the only breakage was an untouched pinning test whose width math shifted — collateral, not a reconstruction.
- The bug's true behavior (a joined column measured to width > 174 after a query change) is asserted **only** by the Cypress spec added in the same commit: `describe("issue 56771")` in `e2e/test/scenarios/visualizations-tabular/visualizations-tabular-reproductions.cy.spec.js`.

### (5) reconstruction_failed
- **category:** `no_unit_oracle__real_oracle_cypress`
- **reconstructable?** No — not via the provided unit oracles. The discriminating oracle is the Cypress e2e test `issue 56771`; the unit-spec edits in the fix commit are mechanical adaptations (test-scoping + callback-type change) to the measurement refactor, not behavioral assertions of the bug.

Relevant paths:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a770e3365b584e61e/frontend/src/metabase/dashboard/components/DashCard/Dashcard.unit.spec.tsx` (scoping adaptation, line ~230-236)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a770e3365b584e61e/frontend/src/metabase/data-grid/components/DataGrid/DataGrid.unit.spec.tsx` (type-only change)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a770e3365b584e61e/frontend/src/metabase/data-grid/hooks/use-data-grid-instance.tsx` and `use-measure-column-widths.tsx` (fix present but heavily drifted via later refactors #67429, #71407, #71467)
