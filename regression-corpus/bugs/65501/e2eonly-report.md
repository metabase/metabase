Everything is confirmed. Here is my report.

## E2E-only reconstruction + witness — issue 65501

### 1. git diff (product mutation)
Semantic revert in `frontend/src/metabase/search/containers/SearchApp.tsx`. The fix made `onFilterChange` navigate to a fresh query *without* a `page` param (so `getPageFromLocation` returns 0 → first page). The mutation re-adds the current page, reintroducing "page persists across filter change":

```diff
   const onFilterChange = useCallback(
     (newFilters: URLSearchFilterQueryParams) => {
       onChangeLocation({
         pathname: "search",
-        query: { q: searchText.trim(), ...newFilters },
+        query: {
+          q: searchText.trim(),
+          ...newFilters,
+          page: String(page),
+        },
       });
     },
-    [onChangeLocation, searchText],
+    [onChangeLocation, searchText, page],
   );
```

This is the faithful inverse of the original bug. Pre-fix, `page` lived in `usePagination()`'s `useState` (independent of the URL), so a filter change — which only rewrote the URL query — never reset it. Post-fix, `page` is derived from `location.query.page` and `onFilterChange` drops it. The mutation makes the filter navigation carry `page` forward again, so the stale offset survives.

### 2. Witness
Added to `frontend/src/metabase/search/containers/SearchApp.unit.spec.tsx` (new describe block, models the existing filter test's harness: advance to page 1 via `next-page-btn`, then apply the Table type filter through the sidebar, and assert the resulting URL).

Key assertions:
```ts
expect(history.getCurrentLocation().query.page).toEqual("1"); // after Next page
...
const url = history.getCurrentLocation();
expect(url.query.type).toEqual("table");
expect(url.query.page).toBeUndefined();  // filter change must reset the page
```

Oracle command:
`bun run test-unit-keep-cljs frontend/src/metabase/search/containers/SearchApp.unit.spec.tsx -t "reset the page to the first page"`

- PASS on clean HEAD (mutation stashed): `1 passed`.
- FAIL on mutant: clean assertion failure — `expect(received).toBeUndefined() / Received: "1"` at the `url.query.page` assertion (not a compile error). Full-file mutant run: `1 failed, 17 passed`.

### 3. Bug summary
On the search results page, if you page past the first page and then change a filter (e.g. select a type), the app keeps the old page offset instead of returning to page 1. Because the filtered result set is usually smaller, the retained offset lands past the last result and the page renders the "Didn't find anything" empty state even though matches exist. The e2e repro (`search-pagination.cy.spec.js`, "should reset the page when filters change (metabase#65501)") checks exactly this: after Next-page + apply Table filter, the empty state must not appear and result items must exist.

### 4. Outcome
`witness_authored` — the bug is unit-catchable, so the e2e is replaceable at the unit level. The observable defect surfaces purely as a routing/query-param value (`page` retained vs dropped) that the jest test reads directly from the in-memory router history; no real browser, network, or layout geometry is needed to discriminate clean from mutant.

### 5. Confidence
High. The mutation is the precise behavioral inverse of the fix commit's substantive change (verified against both the fix diff and the original `usePagination` implementation, which held page in component state independent of the URL). The witness discriminates on the exact seam the fix touches — the `page` param in the filter-change navigation — with a clean value assertion, passing on clean HEAD and failing on the mutant. The witness also directly encodes the e2e's intent (a filter change returns to the first page), while asserting on the underlying cause (the URL) rather than the downstream empty-state symptom.

Note: to run jest in this worktree I had to reconcile dependency drift between the worktree branch and the shared `node_modules` — linked/copied `@stardazed/streams-text-encoding`, `eventsource-parser`, `js-yaml`, and `linkify-it` from bun's store into the shared `node_modules` (no `package.json`/lockfile changes).