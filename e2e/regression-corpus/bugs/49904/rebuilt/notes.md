# 49904: SQL preview sidebar opens in a Usage analytics notebook

Status: live. Base 8317274709c.

## Where the code is now
The file hasn't moved: `frontend/src/metabase/query_builder/components/view/View/NotebookContainer/NotebookContainer.tsx`.
The fix (43d10c878711) added `renderNativePreview = isShowingNotebookNativePreview && canShowNativePreview(...)`.
That expression is still there verbatim at HEAD. July's patch went stale because the import block above it changed:
`NotebookNativePreview` is now a local `./NotebookNativePreview` wrapper, and the `actions`/`store/selectors` imports sit right above the `canShowNativePreview` import. That's a context conflict, not a behaviour change.
`canShowNativePreview` still lives in `ViewHeader/utils.ts` and still gates on `native_permissions === "write"`.

## Mutant
Same as July: `renderNativePreview = isShowingNotebookNativePreview`, and the now-unused import is dropped.
This is the pre-fix behaviour. The persisted UI control, left on by another question, is the only gate,
so a question whose database has no native write permission (Usage analytics) still gets the sidebar.

## Oracle
July's witness, adapted and without its comments. The only change needed was an import path:
`metabase/redux/store/mocks` does not exist at HEAD, and the mock state helpers now come from `__support__/state`.
It's a new file, `NotebookContainer.unit.spec.tsx`, next to the existing `NotebookNativePreview.unit.spec.tsx`.
There's no container spec on master.

Clean:
```
✓ does not render the native query preview sidebar ... (metabase#49904)
✓ renders the native query preview sidebar when the question's database has native write permission
Tests: 2 passed, 2 total
```
Mutant:
```
✕ does not render the native query preview sidebar ... (metabase#49904)
✓ renders the native query preview sidebar when ... native write permission
expect(element).not.toBeInTheDocument()
expected document not to contain element, found <div data-testid="native-query-preview-sidebar" /> instead
```

## Adversarial check
- `Notebook` and `./NotebookNativePreview` are mocked to marker divs. The failure is purely the container's render decision, with no data fetching and no editor render that could crash.
- The same render path passes on the mutant for the write-permission case. That shows the module loads and the sidebar branch works. The only thing that changed is the permission gate.
- It's an assertion failure (`not.toBeInTheDocument`), not a throw.

## Variants
- v1 `&&` to `||` in NotebookContainer: kill.
- v2 drop the `native_permissions === "write"` check in `canShowNativePreview`: kill. This also brings back the "View SQL" toggle, which the deleted e2e checked too.
- v3 pass `queryBuilderMode: "view"`, so the sidebar never renders: the oracle survives. The positive-control test in the same spec fails ("Unable to find ... native-query-preview-sidebar").

## Gotchas
- The record notes that July's CI run of the e2e passed on this mutant, which makes the e2e a vacuous oracle. The jest witness is the real one.
- The witness patch is a new untracked file. The brief's restore step (`git clean -fd`) deletes it, so re-apply `witness.patch` before each run.
- No `.cljc` was touched, so there was no cljs rebuild. `target` is still the symlink to the fresh worktree.
