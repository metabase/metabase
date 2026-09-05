# models/create.cy.spec.js → tests/models-create.spec.ts

4 tests, all green on the jar (slot 4, COMMIT-ID 751c2a98), 4/4 first try,
8/8 under `--repeat-each=2`. tsc clean.

## Fixes classified

No product bugs, no fixmes. All faithful ports; only mechanical porting work:

- **Retried location asserts → expect.poll** (known gotcha). Both the
  `/^\/model\/\d+-.*$/` landing check and `checkIfPinned`'s
  `/collection/root` equality — Cypress `cy.location().should("match"/"eq")`.
- **beforeEach `cy.intercept(...).as("dataset")` + `cy.wait("@dataset")` →
  waitForDataset registered before the play/run click** (rule 2). Same for the
  per-test `@createModel` (POST /api/card) and `@previewModel` (POST
  /api/dataset) aliases.
- **`cy.signIn("nocollection"|"nosql")` → signInWithCachedSession** (rule 7 /
  environment fact): both users have cached snapshot sessions but aren't in the
  typed USERS map. Reused the existing NOCOLLECTION_PERSONAL_COLLECTION_NAME
  constant instead of re-deriving the personal-collection name.
- **Save-modal name field**: Cypress `findByLabelText("Name").type()` →
  `getByLabel("Name", { exact: true }).fill()`. It's a plain form input (not an
  EditableText title), so `fill` marks it dirty fine — no pressSequentially
  needed. Confirmed working on the jar.
- **Pinned-model row menu**: Cypress `closest("a").find(".Icon-ellipsis")
  .click({ force: true })` → anchor via `xpath=ancestor-or-self::a[1]`, hover
  the anchor first (ellipsis is hover-gated), then force-click.

## New helpers

`support/models-create.ts` (new file per brief): `navigateToNewModelPage`,
`waitForCreateModel`, `checkIfPinned`. Everything else imported from shared
modules (models.ts `waitForDataset`, native-editor.ts `typeInNativeEditor`,
notebook.ts `miniPicker`, ui.ts `modal`/`icon`/`popover`, permissions.ts
`signInWithCachedSession`, question-new.ts `NOCOLLECTION_PERSONAL_COLLECTION_NAME`).

## Dividends

None flagged — no Cypress-masked issues surfaced; the spec is small and the
flows are all happy-path model creation.
