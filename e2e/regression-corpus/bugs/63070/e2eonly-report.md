Both the product mutation and the witness are in place. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `6b8e95a3` — removed the `queryBuilderMode="notebook"` prop from the `<Visualization>` in `VisualizationPreview`:

```
frontend/src/metabase/querying/notebook/components/NotebookStep/NotebookStepPreview/NotebookStepPreview.jsx
@@ -97,7 +97,6 @@ export const VisualizationPreview = ({ rawSeries, result, error }) => {
     <Visualization
       rawSeries={rawSeries}
       error={err}
-      queryBuilderMode="notebook"
       className={cx(
```

This faithfully reintroduces the bug: `queryBuilderMode` flows Visualization → `TableInteractive`, where the `rowId` useMemo (TableInteractive.tsx:632-645) computes `isNotebookPreview = queryBuilderMode === "notebook"`. Without the prop, `isNotebookPreview` is false, so `hasObjectDetail` becomes true and the table renders an `"expandButton"` row-id column (`RowIdCell`, `data-testid="row-id-cell"`) — the object/detail-view column the fix suppressed.

### 2. Witness — authored
Added to `frontend/src/metabase/querying/notebook/components/NotebookStep/NotebookStepPreview/NotebookStepPreview.unit.spec.tsx`. It renders the exported `VisualizationPreview` with a two-row table series (going through the real Visualization → TableInteractive → DataGrid stack) and asserts no detail column:

```tsx
it("should not render the object-detail / row-id column in the preview (metabase#63070)", () => {
  mockGetBoundingClientRect();
  jest.useFakeTimers();
  const rawSeries = [createMockSingleSeries({ display: "table" }, { data: {
    rows: [["1","Widget"],["2","Gadget"]],
    cols: [createMockColumn({ base_type:"type/Integer", name:"ID", display_name:"ID" }),
           createMockColumn({ base_type:"type/Text", name:"Name", display_name:"Name" })],
  }})];
  renderWithProviders(<VisualizationPreview rawSeries={rawSeries} result={null} error={null} />);
  act(() => { jest.runAllTimers(); });
  expect(screen.queryAllByTestId("row-id-cell")).toHaveLength(0);
  jest.useRealTimers();
});
```

`mockGetBoundingClientRect()` + fake-timer flush are required so the virtualized DataGrid actually renders body rows in jsdom (same pattern as `DataGrid.unit.spec.tsx`).

Oracle command:
`bun run test-unit-keep-cljs frontend/src/metabase/querying/notebook/components/NotebookStep/NotebookStepPreview/NotebookStepPreview.unit.spec.tsx`

- PASS on clean HEAD: `row-id-cell` length 0 → 4/4 tests pass.
- FAIL on mutant: `expect(received).toHaveLength(expected) — Expected length: 0, Received length: 2` (two `row-id-cell` expand buttons rendered).

### 3. Bug summary
In the notebook step preview, the results table incorrectly rendered the object-detail "view details" expand column (the `>`/`row-id-cell` gutter). The e2e repro (`metabase#63070`) opens the Orders notebook preview and asserts `findAllByTestId("row-id-cell").should("have.length", 0)`. The fix passes `queryBuilderMode="notebook"` so `TableInteractive` treats it as a preview and omits that column.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable. The discriminating behavior (presence/absence of the `row-id-cell` column) is fully observable in a jsdom render of the exported `VisualizationPreview`; no real browser, routing, or network is needed.

### 5. Confidence
High. The mutation is the exact inverse of the one-line fix, and the witness reproduces the e2e's own oracle (`row-id-cell` count) at the unit level, exercising the same prop-threading path (VisualizationPreview → Visualization → TableInteractive `rowId` memo). Verified empirically both directions: 0 cells clean, 2 cells mutant, with a clean assertion failure (not a compile/render error). The only non-obvious requirement is the bounding-rect mock + timer flush to make the virtualized grid emit rows in jsdom.

Note: the pre-existing `resolveFontSizeToPx` console.warn is unrelated noise from the table theme code and does not affect the assertion.