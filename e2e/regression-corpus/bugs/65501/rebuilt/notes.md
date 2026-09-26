# 65501: search filter change keeps the old results page

## Where the code is now
The fix (76cf73dde5d, Nov 2025) was in `SearchApp.jsx`. It is now
`frontend/src/metabase/search/containers/SearchApp.tsx`. The component reads the page from
`location.search` through `getPageFromLocation`. It navigates with react-router v7 `useNavigate`
and `queryToSearch`. July's patch rewrote `query: {...}` for `onChangeLocation`, and that call
is now `search: queryToSearch({...})`, so July's patch conflicts. The fix logic itself is unchanged:
`onFilterChange` builds a fresh query from `q` plus the new filters, with no `page`.

## Mutant
`onFilterChange` adds `page: String(page)` to the query it navigates to, and `page` joins the
`useCallback` deps. A filter change then keeps the old page, which is the pre-fix behaviour.
Before the fix, `page` lived in `usePagination` state and a filter change never reset it.
Same bug: with the Table filter the mock returns 1 item, the offset stays at 4, and the page
renders "Didn't find anything".

The `page` dep is required. Without it the callback is created on the first render with
`page = 0` and never rebuilt, because `navigate` is stable and `searchText` is an equal string.
The URL then gets `page=0`, so the user still sees the first page. The oracle still fails, but
on the URL shape ("0"), not on the behaviour. I ran this as a scratch check; it is not a variant.

## Oracle (new, in the existing spec file)
`SearchApp.unit.spec.tsx` › filtering search results with the sidebar › "should reset back to
the first page when filters change (metabase#65501)". This test is not on master. The record's
`fix_tests` entry points at a test from bf3736f0270, which only exists on the
`regression-corpus-v2` and `dev-2347` branches and uses the removed `history.getCurrentLocation()`.
I rewrote it against the `TestRouter` handle from `renderWithProviders`: it reads
`router.location.search` through `URLSearchParams`.

Steps: render with `q=Test` (PAGE_SIZE is mocked to 4, 7 items), click `next-page-btn`, assert
"5 - 7" and `page=1`, apply the Table type filter from the sidebar popover, then assert
`type=table`, no `page` param, "Test Table" rendered, and no empty state.

Clean: `Tests: 18 passed, 18 total` (186 ms, no console errors). Mutant: `1 failed, 17 passed`
```
expect(received).toBeNull()
Received: "1"
> 228 |       expect(params.get("page")).toBeNull();
```

## Adversarial check
- The other 17 tests pass on the mutant, including pagination and the 7 filter tests, so this is
  not a render crash or a broken module.
- The failure is a value mismatch on the URL `page` param, which is exactly what the fix removed.
- I also removed the URL assertion as a scratch check. The mutant then fails on
  `findByTestId("search-result-item-name")`, and the DOM dump contains "Didn't find anything".
  That is the e2e's user-visible symptom, reproduced in jest.

## Variants (oracle run on each)
1. The reset writes `page: "1"`, as if pages were 1-based: **kill** (Received "1").
2. `onFilterChange` drops `q`, so a filter change clears the search text: **survive**. The mock
   returns everything for an empty `q` and the table filter still yields Test Table.
3. `advancePage` drops `...searchFilters`, so paging loses the filters: **survive**. The test
   pages before it filters.

## Gotchas
- jest ran fine with no dependency fixes. No cljc was touched, so no cljs rebuild was needed.
- Variant 1 is longer than 80 columns (a prettier complaint only). It compiles and runs.
