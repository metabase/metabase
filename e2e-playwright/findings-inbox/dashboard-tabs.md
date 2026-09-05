# dashboard-tabs (dashboard/tabs.cy.spec.js → dashboard-tabs.spec.ts)

15 tests (13 core + 2 snowplow), 30/30 green on the jar under `--repeat-each=2`
(slot 10). tsc clean. New helpers in `support/dashboard-tabs.ts` only.

## Fixes classified

- **Known gotcha (saveDashboard/awaitRequest)** — after adding a card via the
  questions sidebar, anchored `expect(getDashboardCards).toHaveCount(1)` before
  `saveDashboard` so the dashboard is dirty when Save is clicked (else the PUT
  never fires and saveDashboard burns 30s). Applied in the "only display cards",
  "only fetch cards" (×2) and "loading spinner" tests.

- **Known gotcha (snowplow → no-op stubs, rule 6)** — the second describe's
  reset/enable/expect/assertNo snowplow calls are local no-ops; the two tests
  keep their real UI actions (create/delete/move tab) so they still exercise
  the flow.

- **New gotcha: two support modules, two id counters, colliding dashcard ids.**
  `getTextCardDetails` (dashboard-core.ts) and `getHeadingCardDetails` /
  `getLinkCardDetails` (click-behavior.ts) each mint negative ids from an
  *independent* `getNextUnsavedDashboardCardId`, so mixing factories across
  modules yields duplicate ids and `PUT /api/dashboard` 400s with "ids must be
  unique". Upstream shared one counter. Fix: reassign `id: -1 - index` after
  building the array. (Consolidation candidate: unify the unsaved-dashcard-id
  counter across factory modules.)

- **New gotcha: a dnd-kit tab drag leaves the strip swallowing the next click.**
  The tab reorder (#34970) is a dnd-kit sortable. After a synthetic real-mouse
  drag + `mouse.up()`, the tab order updates in the DOM (pre-save assertions
  pass) but the pointer sensor is still settling; a `saveDashboard` fired
  immediately *clicks the Save button (it gains focus) yet no `PUT
  /api/dashboard` fires* — the click is swallowed while the drag settles. Trace
  confirmed: "Click …save-edit-button" present, zero dashboard PUTs.
  `reorderTabToStart` now parks the mouse away from the strip and waits ~1s
  after the drop (the dashboard-core tab-drag test settles the same way with a
  `waitForTimeout(1000)`). Signature is misleading — it reads as "Save is
  broken" / "dashboard not dirty" when it's a lingering pointer capture.

## Migration observation (Cypress-masked dead code — NOT a product-bug claim)

The spec's `assertFiltersVisibility` calls
`cy.findByTestId("dashboard-parameters-widget-container", () => { visible.forEach(...); hidden.forEach(...); })`.
The arrow function is passed where testing-library's `findByTestId` expects an
**options object**, so it is never invoked — every per-filter
`should("exist")` / `should("not.exist")` inside it is **dead code**. Upstream
this helper only ever asserted the two widget containers exist and toggled edit
mode.

I first ported the *evident intent* (scoped per-tab filter visibility) and it
**failed on the jar**: on Tab 1 the "Text filter" is not shown in
`dashboard-parameters-widget-container`. Note the test data maps the text
filter with a mismatched `card_id` (`ORDERS_BY_YEAR_QUESTION_ID`) onto the
Tab-1 dashcard whose card is `ORDERS_QUESTION_ID`, so it's plausible the app is
correct and the never-run assertion was simply wrong. Because the assertions
never executed upstream, there is **no cross-checkable baseline** — restoring
them and calling the miss a bug would be manufacturing exactly the kind of
retracted product-bug claim PORTING.md warns about. So the port keeps
`assertFiltersVisibility` faithful to the dead-code behaviour (containers exist
+ edit toggle). The still-live `assertFilterValues` (URL query-string checks)
carries the real per-filter coverage and passes.

Worth an upstream issue: the visibility assertions this test is named for have
been silently disabled since they were written.

## Notes on the view_count arithmetic ("only fetch cards on the current tab")

The absolute `view_count` assertions (1 → 2 → 3) hold on the jar. Verified the
model: card / dashcard / public-dashcard `…/query` requests bump `view_count`;
`GET /api/card/:id` (the firstQuestion/secondQuestion reads) does **not**,
despite the upstream comment labelling an increment "+1 (firstQuestion)". Ported
the reads freely and gated each `view_count` check with `expect.poll` (the
increment can land a tick after the query response).
