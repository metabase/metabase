# Hole-closer report — metabase#63745 (FE)

_Verbatim report from the unit-test-authoring agent (a961bd8e5d5543d0e)._

---

All green. ObjectDetailPanel.tsx is restored (empty diff), and the full spec passes 26/26.

## Report

### (1) New test code + file

Added a container-level regression test to the existing spec (no new file needed — one already existed):
`frontend/src/metabase/visualizations/components/ObjectDetail/ObjectDetailPanel.unit.spec.tsx`

Two supporting imports were added (`createMockDatasetData`; and the `DatasetData`/`RowValue` types), plus fixtures and a `renderPanel` helper, then this describe block:

```tsx
describe("ObjectDetailPanel column desync (metabase#63745)", () => {
  it("renders headers from the latest passedData after a column toggle", () => {
    const { rerender } = renderWithProviders(
      renderPanel(initialData, initialZoomedRow),
    );

    // Sanity: the initial column set is rendered.
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.queryByText("Vendor")).not.toBeInTheDocument();

    // Simulate the toggle: a new `data` prop arrives with a different column set.
    // ObjectDetailPanel keeps a local `data` state seeded from the initial prop,
    // so it must read columns from the fresh prop, not the stale local copy.
    rerender(renderPanel(toggledData, toggledZoomedRow));

    // The rendered headers must reflect the NEW passedData, not the stale copy.
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
  });
});
```

The fixtures build two `DatasetData` objects from `testDataset.cols`: `initialData` has columns `[ID, Title, Category]`; `toggledData` has `[ID, Title, Vendor]` (Category toggled off, Vendor toggled on). `renderPanel` mounts the real `ObjectDetailPanel` container with `renderWithProviders` and the full required prop set. The test mounts with `initialData`, then uses RTL's `rerender` to deliver the toggled `passedData` — exactly the wiring the leaf specs (`ObjectDetailBody`/`ObjectDetailsTable`) skip.

### (2) Clean HEAD — PASS
`Tests: 25 skipped, 1 passed, 26 total` for the targeted test; full file `Tests: 26 passed, 26 total`.

### (3) Bug reintroduced — FAIL (clean assertion failure)
Reverting the call site in `ObjectDetailPanel.tsx` (~line 359) from `columns={passedData.cols}` back to the stale `columns={data.cols}` produced `Tests: 1 failed, 25 skipped`. The failing assertion is `expect(screen.getByText("Vendor")).toBeInTheDocument()` → `TestingLibraryElementError: Unable to find an element with the text: Vendor`. With the stale local `data` state (seeded once via `useState(passedData)` and never resynced), the toggled Vendor header never renders — precisely the header/value desync of #63745. `ObjectDetailPanel.tsx` has been restored (verified: empty git diff).

### (4) Confidence
High. The test fails for the exact reason the bug exists (stale `data` state vs. fresh `passedData` prop), targets the specific call site, and passes only with the fix. It is synchronous (no FK/action fetches triggered by this prop config) and deterministic.

### (5) Caveats
- The container mounts cleanly in jsdom — no impracticality; the "test at the container, not the leaf" recommendation holds well here.
- There is a benign `act(...)` console warning from `ActionExecuteModal`/RTK-query async state settling after render. It does not affect pass/fail (present in both directions) and is consistent with the pre-existing tests in the same file.
- The assertion keys on column header display names ("Category"/"Vendor") which are distinct from any rendered cell value, so there's no text-collision ambiguity.
