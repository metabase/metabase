# collections-trash.spec.ts (port of collections/trash.cy.spec.js)

Ported 17 tests (1018-line source). Verified on the CI EE jar (slot 7,
`PW_PER_WORKER_BACKEND=1`), 17/17 green, then 34/34 under `--repeat-each=2`.
tsc clean (the one `visualizer-basics.ts` error is a sibling agent's file).

## New gotcha — bfcache captures a still-open Mantine modal overlay across `goBack()`

`ensureCanRestoreFromPage` archives an entity via the "Move this X to trash?"
confirm modal, then does `goto("/collection/root")` → `goBack()` to return to
the archived entity's detail page and click Restore in its banner. The Restore
click timed out: a fixed `mb-mantine-Modal-overlay` intercepted pointer events
on the restored page.

Cause: `page.goBack()` restores the previous page from Chromium's
back-forward cache — the exact DOM at navigation time. The archive PUT was
still settling when `goto(root)` fired, so the confirm modal's overlay was
still mounted, and the cached snapshot kept it. Cypress never hit this because
its inter-command latency always let the modal finish closing first.

Fix: `await expect(modal(page)).toHaveCount(0)` before navigating away, so the
snapshot cached for `goBack()` is overlay-free. General pattern: **before any
navigation whose history entry you will `goBack()` to, wait for transient
overlays (modals/toasts) to unmount** — bfcache freezes whatever is on screen.

## Faithful-port notes (no product bugs found)

- Snowplow describe → no-op stubs (rule 6); trash/restore UI flow ported real.
- `.should("not.be.disabled")` on the bulk toast's Restore/Move/Delete labels
  ported as `getByRole("button", { name }).toBeEnabled()` — captures intent
  (in Cypress the assertion is near-vacuous on the label span; the buttons are
  real and their enablement is the point of the bulk-restore/move/delete tests).
- Sidebar drag/drop `@updateDashboard.all` request counters → `countRequests`
  (dashboard-parameters.ts), registered before the drag; HTML5 dnd via
  collections.ts `dragAndDrop` (real CDP dnd, not the synthetic 3-event seq).
- `toggleEllipsisMenuFor` needed row-hover + forced ellipsis click (rule 4 /
  collections-core precedent); Cypress clicked the icon directly.
