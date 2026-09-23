# models-list-view

Port of `models/models-list-view.cy.spec.js` → `tests/models-list-view.spec.ts`.
6/6 tests green on the jar (slot 1, COMMIT-ID 751c2a98), 12/12 under
`--repeat-each=2`, tsc clean. New helpers isolated in
`support/models-list-view.ts`.

## Fixes classified (all known gotchas — no product bugs)

1. **Currency-formatted preview value is a mixed-content node.** The list-view
   preview renders DISCOUNT as `$123.46` (the `$` shares the node), so an exact
   `getByText("123.46")` matches nothing. Upstream `cy.findByText("123.46")`
   passed because testing-library matches per-text-node. Ported as a
   case-sensitive substring regex `/123\.46/` — the existing "mixed-content text
   nodes" rule. (SUBTOTAL/TAX/QUANTITY next to it are plain numbers, no `$`, so
   they stay exact.)

2. **`cy.wait("@dataset")` after "Turn back to saved question" enforced
   nothing.** Turning a model back to a saved question re-runs via
   `/api/card/:id/query`, not `/api/dataset`. Upstream's `@dataset` wait was
   satisfied *retroactively* by the earlier save-step `/api/dataset`
   (`cy.wait` consumes past responses); a fresh Playwright `waitForResponse`
   hung 30s. Dropped it — the auto-retrying `undoToast` / `list-view`-gone
   assertions cover the sync. Textbook "cy.wait after a non-triggering action".

3. **`findByText` column names are EXACT; `getByText` defaults to substring.**
   Rule 1. `getByText("ID")` matched ID/USER_ID/PRODUCT_ID (strict-mode
   violation) — all ALL-CAPS column-name matches now carry `{ exact: true }`.

## Notes / no dividends

- No new FINDINGS-worthy behaviour; the port is faithful and everything passes
  on the jar without a cross-check (no fixme/bug claims made).
- `H.dragAndDropByElement(..., { dragend: false })` (native HTML5 draggables)
  → real `dragTo` (collections.ts pattern); the app applies the change on
  `drop`, so the trailing `dragend` is harmless.
- `H.createNativeQuestion({ type:"model" }, { visitQuestion:true })` → API
  create + `visitModel` (models redirect /question/:id → /model/:id and run
  /api/dataset), mirroring models-metadata.spec.
- `Color(colors["accent1"]).rgb().toString()` → inlined `ACCENT1_RGB =
  "rgb(136, 191, 77)"` (#88BF4D; no path alias into frontend/src). Verified
  against the jar's computed `background-color`/`color`.
- "Edit metadata" clicked via `openQuestionActionsItem(page, /Edit metadata/)`
  (menuitem regex) to tolerate the completeness badge.
