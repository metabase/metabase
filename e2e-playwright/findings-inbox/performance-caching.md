# performance-caching (admin/performance/caching.cy.spec.ts)

Ported 5 tests (1 oss + 4 ee). All green on the jar (slot 2), 10/10 under
`--repeat-each=2`. tsc clean. No fixmes, no product-bug claims, so no
cross-check needed.

## Fixes classified

All mechanical / known-gotcha applications — nothing new:

- **Rule 2 (intercept → waitForResponse before trigger):** the three cache
  waits — PUT /api/cache (save), GET /api/cache?model&id (config load/reload),
  POST /api/cache/invalidate?include=overrides&database=* — matched on
  pathname + method + searchParams, registered before the click.
- **Rule 4 (Mantine Switch):** preemptive-caching toggle is a force-click on
  the `role="switch"` input, not the label.
- **Rule 1 (findByRole/findByText string → exact):** form name "Select the
  cache invalidation policy", "When to get new results", "Our analytics",
  "Orders" all ported with `exact: true`. Regex `cy.findByLabelText`/`cy.button`
  args (`/Edit.*Sample Database.*/`, `/Clear cache/`, `/Duration/`) kept as
  regex.
- **Modal-root toBeVisible reads hidden:** `confirm-modal` test id is the
  Mantine Modal root; `cancelConfirmationModal` asserts the inner Cancel button
  visible instead of the root.
- **Wave-9 parked-cursor gotcha:** parked the mouse (`mouse.move(0,0)`) before
  each keyboard Escape close-path so a tooltip under the cursor can't eat it.
  (Both Escapes — the dirty-form close path and the sidesheet-close in the
  last test — passed cleanly with the mouse parked.)

## Gate handling (as briefed)

- `oss` describe: no conditional skip (mirrors upstream). It sets the default
  (root) strategy, which exists on OSS and EE alike; it activates no token, so
  on the EE jar it behaves like OSS. Passed on the jar.
- `ee` describe: `test.skip(!resolveToken("pro-self-hosted"))`; beforeEach
  activates the token (the jar activates it).

## Dividends

None. This is a faithful port — the Cypress suite was already a well-scoped
smoke test (its header explicitly delegates strategy-resolution / form-binding
coverage to backend + Jest tests). No Cypress-masked issue surfaced; the port
neither strengthened nor weakened any assertion beyond the mechanical
Modal-root and switch-input adaptations above.

## Consolidation note

`ORDERS_COUNT_QUESTION_ID` was derived locally in
`support/performance-caching.ts` (sample-data.ts exports ORDERS_QUESTION_ID but
not this one). This is now the 3rd local re-derivation
(collections-reproductions.ts, click-behavior — via INDEX; and here) — a
candidate for promotion into support/sample-data.ts in a consolidation pass.
