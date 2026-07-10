# Reconstruction report — metabase#63745 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (a63a9360e173d47b4)._

---

The tree is restored to clean baseline. I have enough to report.

## Report: `reconstruction_failed`

### Category: moved-target (behavioral fix relocated outside oracle coverage; oracle spec edits were mechanical prop-signature adaptations, not behavioral assertions)

### (1) What the fix actually did
Commit `102025c6` renamed the leaf-component prop `data: DatasetData` → `columns: DatasetColumn[]` across `ObjectDetailBody.tsx` and `ObjectDetailsTable.tsx` (removing `const { cols: columns } = data;`), and — the one behavioral change — rewired the call site in `ObjectDetailView.tsx` from `data={data}` to `columns={passedData.cols}`.

The real bug is a stale-state mismatch in the call site: `data` is a `useState<DatasetData>(passedData)` copy that lags behind the fresh `passedData` prop. On column toggle, `passedData.cols` updates immediately but the `data` state is stale, so column headers and row values desync. The fix reads `passedData.cols` instead of the stale `data`.

In this tree the call site has drifted: `ObjectDetailView.tsx` no longer exists; it is now `ObjectDetailPanel.tsx`, line 359 (`columns={passedData.cols}`, with `data`/`passedData` state at lines 74/104).

### (2) Oracle specs — baseline vs each revert route
Baseline (both oracle specs): `Tests: 7 passed, 7 total`.

- Route A — faithful semantic bug revert (`ObjectDetailPanel.tsx`: `passedData.cols` → `data.cols`): oracle specs still `7 passed, 7 total`. The oracle specs render the leaf components (`ObjectDetailBody`, `DetailsTable`) directly and pass `columns` explicitly; they never mount `ObjectDetailPanel`, so the stale-state bug is unreachable. **Non-discriminating.**
- Route B — leaf prop-signature revert (`ObjectDetailsTable.tsx`: `columns` prop → `data: DatasetData` + `const { cols: columns } = data`): every test errors with `TypeError: Cannot destructure property 'cols' of 'data' as it is undefined` — a render-time crash before any `expect(...)` runs, because the specs pass `columns={testDataset.cols}` (leaving `data` undefined).

### (3) failure_shape
No route yields an assertion failure. Route A: green (bug invisible to these specs). Route B: render-time `TypeError` crash, not an `expect(...)` assertion failure.

### (4) Confidence + adversarial reasoning
High confidence this is a genuine honest-negative. The leaf components' internal logic is byte-for-byte identical pre/post-fix apart from where `columns` is sourced, so no interface-preserving revert of the leaf can flip an assertion. The fix's diff to the two oracle unit specs is purely mechanical (`data={testDataset}` → `columns={testDataset.cols}`) — zero `expect(...)` lines added or changed. The actual behavioral assertions were added to the E2E spec `e2e/test/scenarios/visualizations-tabular/visualizations-tabular-reproductions.cy.spec.js` ("issue 63745", asserting `map.get("User ID") === "1"` before and after toggling the ID column), which is a Cypress spec not runnable under the jest oracle. I verified both routes empirically rather than reasoning only.

### (5) Harness notes / ambiguity
- The worktree was missing `node_modules` (not just `target`). Symlinking `node_modules` from the main repo (`ln -sfn /Users/.../metabase/node_modules node_modules`) in addition to the documented `target` symlink was required before jest would load.
- The named oracle specs are non-discriminating for this bug; the only unit test that could plausibly exercise the wiring is the out-of-scope `ObjectDetailPanel.unit.spec.tsx` (not in the oracle list, and I did not rely on it).

No changes left in the tree — all product files restored to the clean baseline (`git status` clean for `frontend/`).
