# dashboard-filters-auto-wiring — port findings

Source: `e2e/test/scenarios/dashboard-filters/dashboard-filters-auto-wiring.cy.spec.js`
(839 lines, 16 tests, no gating tags) → `tests/dashboard-filters-auto-wiring.spec.ts`.
New helpers: `support/dashboard-filters-auto-wiring.ts` only (shared helpers imported, never edited).

Verified on the **jar** (default), slot 5
(`JAR_PATH=…/target/uberjar/metabase.jar PW_PER_WORKER_BACKEND=1 PW_SLOT_OFFSET=5`,
backend on :4105): **15 passed / 1 skipped / 0 failed**, and clean under
`--repeat-each=2` (**30 passed / 2 skipped**). tsc clean. The 1 skipped is the
single `test.fixme` documented below.

## test.fixme (1) — harness limitation, NOT a product bug (cross-check done)

`in case of two auto-wiring undo toast, the second one should last the default
timeout of 12s` (metabase#35461).

**Fidelity cross-check: the ORIGINAL Cypress test PASSES on this same jar
backend** —
`MB_JETTY_PORT=4105 GREP="the second one should last the default timeout" CYPRESS_RETRIES=0 bunx cypress run --browser chrome --config-file e2e/support/cypress.config.js --spec e2e/test/scenarios/dashboard-filters/dashboard-filters-auto-wiring.cy.spec.js`
→ `1 passing`. So the app's undo-toast timing is correct; the port drifted, and
the drift is structural to the Playwright harness:

- **`page.clock.install()` does NOT freeze time** (measured with a probe: page
  `Date.now()` advanced 1506ms over 1.5s of real wall-clock after install). The
  clock keeps ticking at real rate and `runFor` only *adds* jumps, so real time
  spent on Playwright actions ages the app's timers on top of the ticks — a ~2s
  drift for this test. `cy.clock()` freezes. `pauseAt(now+buf)` does freeze it,
  but then…
- …**the toast render is gated by a `setTimeout(1)`** (`UndoListOverlay`
  `transitionState`), so under a frozen clock the toast only renders on a
  `runFor`, desyncing "toast in redux" from "toast in DOM".
- **The app disables the toast `TransitionGroup` entirely under
  `"Cypress" in window`** (`UndoListing.tsx:203/210`). Playwright is not
  detected as Cypress, so the live transition + unmount-on-exit (300ms) path
  runs; injecting `window.Cypress` did NOT fix it (and would flip
  `isCypressActive` app-wide — ExplicitSize, EmotionCache, etc.).

Net: driven back-to-back by Playwright (frozen **or** real clock), the surviving
suggestion toast stays anchored to the *first* select and dies **~10.6s after
the second select** (measured), where the assertion needs it alive at 11s. Under
Cypress's command-queue pacing the second select yields an independent 12s
toast. This is the same "Cypress command queue paces commands that Playwright
fires back-to-back" class already documented in PORTING.md (saveDashboard,
list-reconciliation), applied to the undo-toast lifecycle. The body is kept as a
faithful record. The **sibling** clock test (`should dismiss toasts on timeout`)
ports cleanly with plain `install()` + `runFor` (its 1s-vs-12s margins absorb
the non-freeze drift), so only this tight timer-ordering regression is
harness-bound.

## Known gotchas hit (PORTING.md), no new class

- **`undoToast()` (singular `getByTestId`) is a strict-mode trap when two toasts
  briefly coexist.** After clicking Auto-connect the suggestion toast animates
  out while the result toast animates in; Cypress's slower pacing only ever saw
  one. Fixed by targeting the specific toast with
  `undoToastList(page).filter({ hasText: … })` (result-text or `"Undo"`), for
  both `toContainText` assertions and the `.icon("close")` click.
- **`\d+` in a dashcard-query path matcher rejects newly-added (unsaved)
  dashcards**, whose query path carries a **negative** dashcard id
  (`/dashcard/-1/card/…/query`) — confirmed against `api/dashboard.ts:118`. The
  Cypress intercept globs `*` so it matched them; a `\d+` regex times out.
  Widened to `-?\d+` (and `(pivot/)?`). The FK-sidebar test's first
  `cy.wait("@cardQuery")` was additionally **retroactively satisfied** upstream
  by the Products card's load query (cy.wait consumes past responses), so it was
  replaced with a dashcard-count anchor rather than a live wait.
- **Playwright `click({ force: true })` ≠ Cypress force.** Cypress force
  dispatches straight to the element; Playwright force still performs a *real*
  click at the element's coordinates, so a transiently-overlapping sibling toast
  eats it (observed: the FK-sidebar Auto-connect force-clicks left both cards
  un-wired). Fixed by clicking **without** force (Playwright waits out the
  stack-settle animation until the button is uncovered) and gating on each
  result toast before the next click.
- **Auto-wire toasts pause their dismiss timer on hover** (`UndoToast`
  `onMouseEnter → pauseUndo`, `showProgress: true`). The clock tests park the
  real cursor off the toast (`page.mouse.move(2,2)`) so the timer runs.
- Dropped the never-awaited `cy.intercept("GET","/api/dashboard/**").as("dashboard")`
  (rule 2). The 36275 describe's `cy.spy().as("cardQueryRequest")` is never
  asserted on; only the `@cardQuery` alias is used.

## Migration dividends

None — no product bug found. The one non-porting behavior (metabase#35461 timer
ordering) is correct on the jar; see the fixme cross-check above.
