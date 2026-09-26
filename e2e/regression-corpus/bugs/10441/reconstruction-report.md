The reconstruction is a clean kill. Here is the final report.

## 1. git diff (semantic revert)

`frontend/src/metabase/common/components/BucketPickerPopover/BucketPickerPopover.tsx`

```diff
-  const canExpand =
-    initiallyVisibleItemsCount != null &&
-    items.length > initiallyVisibleItemsCount;
+  const canExpand = false;
```

This reintroduces the pre-fix bug from #32953 ("Collapse temporal units list"): with `canExpand` forced false, `hasMoreButton` is always false and `visibleItems` is always the full `items` array, so the long temporal-unit / binning-strategy lists are never collapsed and no "More…" button is rendered — exactly the historic behavior the fix eliminated. `initiallyVisibleItemsCount` remains referenced (in `visibleItems` slice + `shouldAutoExpand`), so no compile/import error.

## 2. Oracle

- Spec (surviving relocated descendant): `frontend/src/metabase/common/components/QueryColumnPicker/ColumnBucketPickerPopover/ColumnBucketPickerPopover.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/common/components/QueryColumnPicker/ColumnBucketPickerPopover/ColumnBucketPickerPopover.unit.spec.tsx`
- Baseline (clean HEAD): Tests: 7 passed, 0 failed.
- Reconstructed (mutation applied): Tests: 3 failed, 4 passed.

Oracle relocation: the shipped spec was `QueryColumnPicker/BucketPickerPopover/BucketPickerPopover.unit.spec.tsx` testing a component named `BucketPickerPopover`. The product was refactored — the collapse-logic component moved to `common/components/BucketPickerPopover/BucketPickerPopover.tsx` (now a generic list-picker taking `items`), and the query-aware wrapper + spec were renamed to `ColumnBucketPickerPopover`. The `INITIALLY_VISIBLE_ITEMS_COUNT` export lives in `TemporalBucketPickerPopover.tsx` (=7). So the "all_specs_gone" class was a false alarm: the descendant spec survives.

## 3. failure_shape

Clean value/DOM assertion mismatches (not compile errors):
- `should collapse advanced temporal bucket options` — `expect(getAllByRole("menuitem")).toHaveLength(7)` → Received length: **16** (full temporal-bucket list).
- `should collapse advanced binning options for coordinate columns` — `toHaveLength(5)` → Received length: **9** (full coordinate-binning list).
- `should collapse after popover is closed` — `getByRole("button", { name: "More…" })` → `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "More…"` (the More button no longer renders).

## 4. Confidence + adversarial

High confidence the failure isolates the reverted collapse behavior. The 4 tests that stay green are exactly the ones whose expectation is "full list shown / no More button":
- `shouldn't show the More button if there are a few binning options for numeric columns` (short list — never collapsed regardless).
- `should expand the list if the selected bucket/binning is in the hidden part` (both assert full length + no More button — satisfied whether via auto-expand or via disabled-collapse).
- `shouldn't collapse after popover is closed if the selected bucket is in the hidden part` (asserts full length).

Only the three tests that assert a *collapsed* count (7, 5) or the presence of the More button fail. That green/red split is the signature of a targeted collapse-logic break, not a blunt render crash (the component still renders every menuitem correctly).

## 5. Outcome

`kill` — with oracle relocation noted (`BucketPickerPopover` → `ColumnBucketPickerPopover`, module-extracted collapse component). The surviving jest spec discriminates the bug cleanly; no new test needed. Diff left in the worktree at `.claude/worktrees/agent-a592870f3ee379ec2`.