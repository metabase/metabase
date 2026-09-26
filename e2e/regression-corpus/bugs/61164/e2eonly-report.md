The mutant compiles cleanly and all 14 existing DataGrid unit tests still pass — corroborating that jsdom is blind to this bug. Task complete.

---

## Report

### 1. git diff (product mutation)

`frontend/src/metabase/data-grid/hooks/use-virtual-grid.tsx`:
```diff
@@ export const useVirtualGrid = <TData,>({
   getRowHeight,
-  datasetIndexAttributeName,
   virtualIndexAttributeName,
 }: VirtualGridProps<TData>): VirtualGrid => {
@@     measureElement: (element) => {
-      const indexRaw = element.getAttribute(datasetIndexAttributeName);
+      const indexRaw = element.getAttribute(virtualIndexAttributeName);
       if (!indexRaw) {
         return defaultRowHeight;
       }
```

The row virtualizer's `measureElement` now keys each row's height on the **display-slot (virtual) index** instead of the **data-row (origin) index**. After a sort reorders rows, virtual slot N still resolves its height from `getRowHeight(N)` (the original data row at position N) rather than from whatever data row now occupies that slot — so wrapped-text heights go stale and rows overlap. This is the semantic reintroduction of issue 61164.

### 2. Witness — none (irreducible layout/geometry)

The original fix (`f7b82d5`) added `sorting` to a `measureRef` `useCallback` dependency to force DOM re-measurement on sort. That mechanism was fully **superseded by refactor #70384 (`7a7585be68c`)**, which rewrote measurement so `measureElement` returns `getRowHeight(originIndex)` — the current equivalent of the fix, and the site of my revert.

No jest witness can discriminate clean vs. mutant, for two independent, decisive reasons — both verified in the test-support code:

- **`ResizeObserver` is a global no-op mock** (`frontend/test/__support__/mocks.js`: `observe(){}`/`disconnect(){}`). The tanstack virtualizer re-measures rows *only* via ResizeObserver. Under the no-op, `measureElement` is never re-invoked after a sort — on clean or mutant. The bug is fundamentally "re-measurement fails to happen on sort," which jsdom cannot exercise at all.
- **`getBoundingClientRect` returns one fixed rect for every element** (`mockGetBoundingClientRect`). `measureBodyCellDimensions` → `getRowHeight` therefore yields an identical height for every row regardless of content, so `getRowHeight(originIndex) ≡ getRowHeight(virtualIndex)` and no row-to-row overlap can ever be produced.

Oracle sanity run (existing suite, against the mutant): `bun run test-unit-keep-cljs .../DataGrid/DataGrid.unit.spec.tsx` → **14 passed / 14** — the entire jsdom suite is blind to the mutation, corroborating no_witness.

### 3. Bug summary

In a virtualized table (dashboard card) with text-wrapping enabled, sorting a column leaves row heights computed from the pre-sort data ordering. Because each row is positioned via `translateY(cumulative-heights)` with a `minHeight` from the stale measurement, a now-taller wrapped cell overflows into the following row — rows visually overlap. The e2e (`table.cy.spec.js`, `metabase#61164`) asserts `rects[i].top === rects[i-1].bottom` (no overlap) after clicking to sort, both ascending and descending.

### 4. Outcome

`no_witness` — irreducible class: **layout/geometry** (real-browser text-wrap cell measurement + virtualizer ResizeObserver re-measurement + pixel-level row overlap). Requires a real browser on both the measurement input side (`getBoundingClientRect` per-content heights) and the trigger side (ResizeObserver-driven re-measurement on sort), neither of which jsdom provides.

### 5. Confidence

High that the mutation faithfully reintroduces the bug: it disables exactly the sort-awareness the refactored code relies on (height keyed to the actual data row), which is the modern successor to the shipped fix — so heights go stale on sort, producing the overlap the e2e checks. High that no unit seam exists: the discriminating signal only appears when `virtualIndex != originIndex` (post-sort) AND rows have content-dependent measured heights AND the virtualizer re-measures — all three are gated on real-browser capabilities that the jest environment explicitly stubs out (no-op ResizeObserver, constant getBoundingClientRect). The mutation is left applied in the worktree; no witness file was added.