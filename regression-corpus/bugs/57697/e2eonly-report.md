Done. Outcome: **witness_authored**. The bug is unit-catchable and the e2e is replaceable.

## 1. git diff (product mutation)

`frontend/src/metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList/util.ts` — semantic revert of fix commit `e1041fcf`. The fix stripped binning off the column before computing its display name; the current code strips both binning and temporal bucket. The mutation stops stripping the binning (keeps only the temporal-bucket strip), reintroducing exactly the fixed behavior:

```diff
-  const columnWithoutBucketing = Lib.withBinning(
-    Lib.withTemporalBucket(column, null),
-    null,
-  );
+  const columnWithoutBucketing = Lib.withTemporalBucket(column, null);
   const columnInfo = Lib.displayInfo(query, stageIndex, columnWithoutBucketing);
```

## 2. Witness

New spec `frontend/src/metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList/util.unit.spec.ts`. It builds a PRODUCTS query, applies default binning to PRICE, adds it as a breakout, then asserts on the exported `getBreakoutListItem` seam:

```ts
const item = getBreakoutListItem(query, STAGE_INDEX, breakout);
expect(item?.displayName).toBe("Price");
expect(item?.displayName).not.toBe("Price: Auto binned");
```

Oracle command: `bun run test-unit-keep-cljs .../BreakoutColumnList/util.unit.spec.ts`
- PASS on clean HEAD (displayName `"Price"`).
- FAIL on mutant: `Expected: "Price" / Received: "Price: Auto binned"` — the exact string the e2e checks for absence of.

## 3. Bug summary

In the Summarize sidebar's breakout column list, a column that already has a binning strategy applied (e.g. Price binned "Auto") shows its display name as `Price: Auto binned` instead of plain `Price`. The e2e repro (issue 57697, in reproductions-4 / originally reproductions-3) opens Summarize on a question binned on PRODUCTS.PRICE and asserts `Price` is visible while `Price: Auto binned` does not exist.

## 4. Outcome

`witness_authored` — the observable is a pure string returned by `Lib.displayInfo` at the exact mutation site, discriminable by a jest unit assertion on the exported `getBreakoutListItem`. No render/routing/browser needed. The e2e is replaceable by this unit test.

## 5. Confidence

High. The mutation targets the precise line the fix commit changed and reproduces the exact buggy string the e2e guards against. The witness passes clean and fails on the mutant with a clean value assertion (not a compile error), and the failure message is the literal `Price: Auto binned` from the original issue. The temporal-bucket strip is left intact so the mutation isolates only the binning regression.

The product mutation is left applied in the worktree; the witness spec is added (untracked) and also left applied.