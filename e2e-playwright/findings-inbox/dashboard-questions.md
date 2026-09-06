# dashboard-questions.cy.spec.js → tests/dashboard-questions.spec.ts

Source: `e2e/test/scenarios/dashboard/dashboard-questions.cy.spec.js` (1336 lines).
New helper module: `support/dashboard-questions.ts` (spec-local seed + selectors only).

## Result

- 23 tests ported (19 admin, 2 limited-users, 2 migration-modal). All issue-free
  in this spec (no upstream `metabase#…` numbers to preserve). Verified on the CI
  EE uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98), slot 2:
  **23/23 green, 46/46 under `--repeat-each=2`.** tsc clean.
- No `test.fixme`, no product-bug claims → no Cypress cross-check needed (every
  fix was a port-fidelity issue, not app behaviour).

## Token gate

The admin describe is token-gated upstream (`H.activateToken("pro-self-hosted")`);
the limited-users / migration describes are NOT (faithfully reproduced). The jar
is EE with a token so all three describes run. Admin beforeEach calls
`mb.api.activateToken("pro-self-hosted")` behind `test.skip(!resolveToken(...))`.

## Fixes (all port-fidelity, classified)

- **Retroactive `cy.wait("@getADashboard")` (known gotcha).** "cannot save
  dashboard question in a read only dashboard" registered a GET
  `/api/dashboard/:id` wait *after* the Save click, but that GET already fired
  during `visitDashboard` and cy.wait consumed it retroactively. In Playwright
  `waitForResponse` only sees the future, so it hung. Dropped the wait (the modal
  is already populated); kept the POST `/api/card` wait, registered before the
  modal Save.

- **Archive→visitDashboard race (new nuance of the create/state race class).**
  "can archive and unarchive a card within a dashboard": after clicking "Move to
  trash", `visitDashboard` reads the dashboard *via the API*. Playwright fired the
  API read before the archive PUT committed, so it saw the still-live dashcard,
  registered a wait for its query, then the loaded page (card now archived) never
  fired that query → 30s timeout inside the shared `visitDashboard`. Cypress's
  command queue paced the archive past the read. Fix: anchor on the archive
  `PUT /api/card/:id` before `visitDashboard`. Symptom is misleading — it throws
  inside the *correct* shared helper, not at the archive step.

- **Mantine Modal root has the `data-testid` but no box (known gotcha,
  `modalContentByTestId`).** The migration tool's `move-questions-into-dashboard-
  info-modal` / `-modal` testids sit on the Modal *root*, which Playwright reports
  as `hidden` even while open (the visible overlay/content are fixed-positioned
  children). `toBeVisible()` on the root fails always. Assert on inner content
  instead. `toHaveCount(0)` on the root is fine for the disappear checks (Mantine
  unmounts on close).

- **Scalar card renders its name twice → strict-mode (transient/duplicate rule).**
  `dashboardCards().getByText("Question 11", {exact})` matched both the
  `legend-caption-title` and the `visualization-root`. Cypress `findByText` takes
  first; ported existence checks on scalar-card names use `.first()`.

- **`selectCollectionItem` row-walk was too broad.** The literal port of
  `.parent().parent().findByRole("checkbox")` landed on a container holding two
  rows' checkboxes. Rewrote to the shared collections-core pattern: scope to the
  collection-table ROW whose exact name cell matches, then click the checkbox's
  enclosing button.

## Port decisions worth noting

- `H.newButton("X")` = click app-bar New + click popover item — ported inline
  (click `newButton`, then `popover().getByText(X)`).
- `H.commandPaletteSearch(query, viewAll)` needed BOTH branches (the shared
  filters-repros copy is viewAll:false only); ported the full form in
  `support/dashboard-questions.ts`.
- `cy.wait(Array(20).fill("@updateCard"))` → `waitForCardUpdates(page, n)`
  (response-counting promise, registered before the Move click).
- Never-awaited aliases dropped (updateCard in "can edit …", saveQuestion in
  "save to a specific tab", createCard kept because it *is* awaited).
- No-change dashboard saves ("we're not actually saving any changes"; the
  move-into-dashboard save) use `saveDashboardWithoutAwaitingRequests` — the
  PUT-awaiting `saveDashboard` would hang. Real-change saves use `saveDashboard`.
- Limited test 2's sidebar card-add anchors on the dashcard being visible before
  `saveDashboard` (the async-add-then-save race gotcha).
- `createMockDashboardCard` + `seedMigrationToolData` reuse the shared
  `updateDashboardCards` (dashboard-core), which preserves the mock's explicit
  dashcard `id` (QUESTION_THREE's id:3 shared across both seeded dashboards),
  matching the Cypress helper exactly.

## Consolidation candidates (later pass)

- `commandPaletteSearch` now has three near-identical copies (filters-repros
  viewAll:false, metrics-search/search-pagination viewAll:true, and this one
  covering both). A single `commandPaletteSearch(page, query, {viewAll})` in
  command-palette.ts would absorb all three.
- `selectCollectionItem` here duplicates collections-core `selectItemUsingCheckbox`
  (page-scoped exact-name variant) — fold together.
