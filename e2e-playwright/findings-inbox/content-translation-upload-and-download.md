# content-translation-upload-and-download

Port of `admin/i18n/content-translation/upload-and-download.cy.spec.ts` →
`tests/content-translation-upload-and-download.spec.ts`.

## Result

13 tests, all green on the jar (COMMIT-ID 751c2a98), slot 5. Stable under
`--repeat-each=2` (26/26). tsc clean. No fixmes, no product-bug claims.

EE-gated (pro-self-hosted token → `content-translation` premium feature). The
"oss" describe deliberately does NOT activate the token, so the config form is
absent on the EE jar — no OSS backend needed.

Local, in-process infra only: multipart CSV upload
(`POST /api/ee/content-translation/upload-dictionary`) and a real browser file
download of the current dictionary CSV. Not infra-gated.

## Fixes / classifications

All mechanical, no new gotchas:

- **Snapshot pattern collapse.** Cypress `before()` did
  restore+activateToken+`snapshot("snapshot-for-upload-and-download")` and each
  `beforeEach` restored that custom snapshot. Ported to a per-test
  restore()+signInAsAdmin()+activateToken() (token activation is cheap) — the
  same shape content-translation-dashboards.spec.ts already uses. Known pattern,
  not a new gotcha.
- **`toSorted` unavailable** under this install's tsc lib target — used
  `[...arr].sort()`. (Same constraint other ports hit.)
- **Transient-UI toast `.first()`** (PORTING known gotcha). `findByRole("status")`
  for the "Dictionary uploaded" / "Could not upload dictionary" toasts →
  `getByRole("status").getByText(...).first()`; the same text also renders as the
  submit-button's `role="alert"` label, so the status-scoped getByText plus
  `.first()` disambiguates.
- **`findAllByRole("alert").contains(regex)`** → `getByRole("alert").filter({
  hasText: regex }).first()`. The component renders several `role="alert"` nodes
  (the "We couldn't upload the file…" heading, each per-row error List.Item, and
  the failed-submit button label), so the any-of `.first()` is faithful to
  `findAll…contains`.
- **`assertOnlyTheseTranslationsAreStored` JWT.** Cypress used the `signJwt`
  cy.task (object payload → `jwt.sign`). Ported by importing `jsonwebtoken`
  directly (resolvable from e2e-playwright) with the same object payload +
  `METABASE_SECRET_KEY` — cleaner than shelling out to `e2e-jwt-sign.js` (which
  signs a JSON *string*; both decode identically here, but the object form
  matches the task and carries `exp` as a real claim).
- **`uploadTranslationDictionary` re-signs as admin.** The Cypress helper called
  `cy.signInAsAdmin()` internally; `assertOnlyTheseTranslationsAreStored` leaves
  the session as a normal user and several tests upload again afterwards, so the
  port keeps the admin re-sign (fixtures' signIn swaps the page cookie, so the
  subsequent `/admin/embedding` goto renders as admin).
- **Hidden file input.** `#content-translation-dictionary-upload-input` is
  `display:none`; Cypress used `selectFile(..., {force:true})`. Playwright's
  `setInputFiles` doesn't require visibility — no force needed.
- **Too-big test endpoint-not-called** (`@uploadDictionarySpy` → `not.been.called`)
  ported as a `page.on("request")` boolean flag asserted false (the frontend
  size check rejects before any request fires).

## Dividends

None. Faithful 1:1 port; the download assertion is marginally stronger than the
Cypress `readFile` (also asserts `suggestedFilename`).

## Helpers

New module `support/content-translation-upload-and-download.ts`:
`uploadTranslationDictionary`, `selectDictionaryFile`,
`assertOnlyTheseTranslationsAreStored`, `generateLargeCSV`, and the fixtures not
carried by content-translation-dashboards.ts (`nonAsciiFieldNames`,
`portugueseFieldNames`, `invalidLocaleXX`, `multipleInvalidLocales`,
`stringTranslatedTwice`). Imports the upload-via-API helper, CSV serializer,
`DictionaryArray` and `germanFieldNames` read-only from
content-translation-dashboards.ts; `METABASE_SECRET_KEY` from embedding.ts.

Consolidation note (later pass): the dictionary fixtures now live in two support
modules (dashboards + this one). A single `content-translation` fixtures module
could hold `germanFieldNames`/`nonAsciiFieldNames`/etc. and the CSV helpers, with
both specs importing from it.
