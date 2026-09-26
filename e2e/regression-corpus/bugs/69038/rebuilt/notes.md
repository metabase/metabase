# 69038: "View as table" in the dashboard visualizer crashes

Status: **live**, with a caveat. The mutant is two hunks in two files, because a later refactor removed the trigger. Base `8317274709c`.

## What the fix did, and what the record gets wrong
Fix 8e68044b267 (#69204) made two changes:
- (a) It wrapped `isNative(card)` in try/catch inside `table.pivot` getDefault.
- (b) It moved `question?.query()` in `HeaderCellWithColumnInfo` so it only runs when info popovers are enabled.

July and the record treat (a) as the bug. It isn't. `getComputedSetting` wraps every `getDefault` in try/catch and only logs "Error getting setting". That was true at the fix commit (`visualizations/lib/settings.js`) and still is at HEAD (`viz-core/lib/settings.ts:94-121`). So an `isNative` throw never crashed a render. July's own CI run of the e2e passed on the (a)-only mutant, which fits this. The crash was (b): before the fix, every header cell called `question.query()` on the visualizer's `dataset_query: {}` card. The "three columns" in `bug.statement` also comes from July's reading. The header crash happened at any column count. The e2e's dashcard happened to have 3 columns.

## Where things are at HEAD
- (a) now lives in `visualizations/Table/definition.ts:150`, which is why July's patch conflicts.
- (b) is still in `TableInteractive/cells/HeaderCellWithColumnInfo.tsx`. The flag now comes from `TableInteractiveContext` (#70384) instead of a prop.
- #81409 (4348d9373eb, "Improve Card type usage") changed the visualizer cards in `visualizer/selectors.ts` from `dataset_query: {}` to `STRUCTURED_QUERY_TEMPLATE`, which parses fine (probed: `isNative` → false, no throw). That removed the trigger, so reversing (a) or (b) on its own is inert at HEAD.

## Mutant
1. `getTabularPreviewSeries`: the preview card goes back to `dataset_query: {}` with `as Card`. This is the pre-#81409 code minus its FIXME comment. It's the input the fix's own comments say to expect ("throws when used in the visualizer").
2. `HeaderCellWithColumnInfo`: `question?.query()` moves back above the `infoPopoversDisabled` check, which reverses (b).

I didn't use a single hunk because neither one alone restores the user-visible failure. With only hunk 1, the main table still renders Count|Sum|Avg (jsdom probe), and only the hidden measuring root throws. With only hunk 2 there's no throw. With both, the modal body is empty and the root unmounts, which matches "crashes instead of showing the merged data". I left (a) out because it changes nothing the user can see.

## Oracle (new): `visualizer/components/TabularPreviewModal/TabularPreviewModal.unit.spec.tsx`
This is a new file. No visualizer component spec existed, and a Table spec can't import `metabase/visualizer` (shared-tier lint: visualizer is a domain module). The test builds state with `getInitialStateForCardDataSource` from a line card with Created At, Count and Products count. It renders the real `TabularPreviewModal` and checks two things: the render does not throw, and the column headers are those three.
- Clean (ran twice): `✓ should show the merged data of a three-column chart (metabase#69038)`.
- Mutant: `✕ ... expect(received).not.toThrow()  Error message: "Invalid query: query cannot be empty"`, thrown at `HeaderCellWithColumnInfo.tsx:48` (the hoisted `question?.query()`).
- On the mutant, all 19 related suites still pass (Table, get-highlighted-table-cells, the visualizer utils/slice/visualizations specs, two QB header specs): 313 tests. So it isn't a break-everything mutant, and nothing already on master catches it.

## Variants (oracle result)
- variant-1, (a) only (July's mutant, ported): **survive**. It's equivalent at HEAD.
- variant-2, trigger only: **kill**. The throw is at `HeaderCellWithColumnInfo.tsx:72`, the else branch. `useMeasureColumnWidths` renders header cells in a separate `createRoot` with no `measurementRenderWrapper`, so `infoPopoversDisabled` falls back to the context default (false). In a browser the table would probably still show, with a console error and no auto-sized columns.
- variant-3, (b) only: **survive**. It's inert because the template query parses.

## Adversarial check
The failure is the bug's own exception, thrown at the exact line the fix guarded, on the real preview path: selector, then modal, then Visualization, Table, TableInteractive, header cell. It is caught by an assertion. The table.pivot guard stays intact in the mutant, and no `definition.ts` frames appear in the failure. On clean HEAD the same render produces the three headers, so the test isn't depending on some unrelated crash. The one weak spot is variant-2: the oracle also kills the trigger alone, through the measuring root, which may not be visible in a real browser.

## Traps
- The worktree's `target` is a symlink to `/private/tmp/metabase-corpus-fresh/target`. No cljc was touched and no cljs rebuild was needed.
- The `as Card` cast is the exact pre-#81409 form. I didn't re-run `tsc` (jest doesn't type-check).
- `git clean -fd -- frontend` deletes the untracked witness spec. Apply `witness.patch` again after each restore.
- Rendering a Table through `Visualization` needs `width`/`height` props (or the modal's layout) plus `mockGetBoundingClientRect`, or no `columnheader` elements appear.
- The record's hint test (`Table.unit.spec.tsx ... getDefault ... (metabase#69038)`) is not on master. I checked a version of it with `not.toThrow`: it passes on the mutant and fails only on variant-1, which isn't a user-visible bug. Don't use it as the oracle.
