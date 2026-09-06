# models/reproductions-3 — port findings

Source: `e2e/test/scenarios/models/reproductions-3.cy.spec.ts`
Target: `tests/models-reproductions-3.spec.ts`
Verified on the jar (COMMIT-ID 751c2a98), slot 1: 13 passed, 2 skipped;
12/12 executable green under `--repeat-each=2`. tsc clean.

New helpers: `support/models-reproductions-3.ts` (`countCardRequests` only —
GET /api/card/:id counter for issue 31905). Everything else imported read-only.

## Skips (faithful, per has-skips gate)
- issue 20624 — upstream describe is `{ tags: "@skip" }` → `test.skip(true, …)`
  at the describe body top.
- issue 22517 — upstream `it` is `{ tags: "@skip" }` → `test.skip("…", …)`.
Both ported in full (bodies + beforeEach) so they compile and stay faithful.

## Fixes classified (all known gotchas — no product bugs, no dividends)

- **Parked-cursor tooltip (known gotcha).** issue 37009 asserts
  `findByRole("tooltip").should("not.exist")` after running the query. Cypress's
  synthetic play-button click never moves the OS cursor; Playwright's real click
  parks it on the run button, which opens its own "Run query (⌘ + enter)"
  tooltip that Cypress never sees. Moving the mouse away did NOT clear it
  reliably. Scoped the assertion to the *validation* tooltip the test actually
  cares about (`getByRole("tooltip", { name: "You must run the query…" })`),
  which is the true intent. Applies to both the create and update legs.

- **`cy.get("main aside")` any-of + hidden clone (rule 3).** issue 22518's
  `H.sidebar().should("contain","ID"/"FOO"/"BAR")` — `main aside` now resolves
  to BOTH the left and right sidebars (strict-mode violation), and
  `.should("contain")` is a case-sensitive any-of over the set. First pinned to
  `rightSidebar`, but that flaked once under `--repeat-each=2` (BAR render lag /
  column could land in the other aside). Final port asserts each column appears
  in SOME `main aside` via `.filter({ hasText: new RegExp(col) }).first()`
  (case-sensitive substring = Cypress `contain`). Robust across repeats.

- **TableInteractive hidden measurement clone (rule 3 + layout timing).** issue
  29951 reorders the "ID" column on the model VIEW page. `getByTestId(
  "header-cell")` matches the real cell AND a `visibility:hidden`, off-screen
  (x≈-9959) measurement clone react-virtualized renders for width calc.
  `.filter({ visible: true }).first()` selects the real one, but
  `moveDnDKitElement` calls `boundingBox()` with no retry and hit a null box
  right after `saveMetadataChanges` re-rendered the table — an explicit
  `await expect(idHeader).toBeVisible()` before the drag settles it. (The clone
  is `visibility:hidden`, so `filter({visible:true})` is the right tool — no
  data-testid needed.)

- **Metadata-editor "Edit metadata" badge (known gotcha).** issue 31663's menu
  open uses `openQuestionActionsItem(page, /Edit metadata/)` (role+regex), never
  an exact getByText — the item text can carry a completeness badge. The
  ellipsis label there ("Move, trash, and more…") is the same qb-header ellipsis
  the helper clicks.

- **Intercept → waitForResponse (rule 2).** `@cardQuery`/`@query`/`@dataset`/
  `@updateCard`/`@updateMetadata`/`@createModel`/`@saveCard` registered before
  the trigger. `@idFields` (GET /api/database/:id/idfields) awaited. `@card`
  (GET /api/card/:id) COUNTED via `countCardRequests` for the `have.length.lte 2`
  assertion (31905). `result_metadata not null` (37009) read from the request
  body via `response.request().postDataJSON()`.

- **cy.location retried → toHaveURL predicate.** issue 20045 asserts
  pathname + empty hash across a refresh via `toHaveURL(url => …)`.

## Notes
- issue 20042 (nodata user) uses `visitModelNoDataAccess` — the model runs via
  POST /api/card/:id/query for a viewer without data perms.
- issue 29951 keeps upstream's `viewportWidth: 1600` via `test.use({ viewport })`;
  Cypress's `requestTimeout: 10000` has no Playwright equivalent (dropped).
- No FINDINGS-worthy dividends and no infra-gated cases — the whole spec runs on
  the jar's default sample DB (no external DB / email / webhook).
