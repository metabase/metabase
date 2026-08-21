# content-translation-questions

Port of `e2e/test/scenarios/admin/i18n/content-translation/questions.cy.spec.ts`
→ `tests/content-translation-questions.spec.ts`.

- 3 tests, all faithful, all green on the jar (slot 3), 6/6 under `--repeat-each=2`. tsc clean.
- EE-gated (`pro-self-hosted` token; the jar activates it). Dictionary upload is a
  local in-process CSV — no external infra.

## Fixes / decisions
- **No fixmes, no product-bug claims** → no Cypress cross-check required.
- Reused shared helpers read-only: `germanFieldNames` +
  `uploadTranslationDictionaryViaAPI` from `content-translation-dashboards.ts`,
  `visitEmbeddedPage` from `embedding-dashboard.ts` (works for a `{ question }`
  resource, not just `{ dashboard }`), `createQuestion` from `factories.ts`,
  `visitQuestion` from `ui.ts`. **No new support file was needed** — everything the
  spec required already existed, so `support/content-translation-questions.ts` was
  not created (helper index unchanged).
- Cypress `before()+H.snapshot()+beforeEach(H.restore(snapshot))` → the per-worker
  `snapshotReady`-flag pattern (mirrors the dashboards precedent's "measure names"
  describe). `productsQuestionId` is captured at snapshot-creation time and reused
  across tests; the id survives the snapshot round-trip.
- The `@uploadDictionary` intercept in the Cypress `beforeEach` is never awaited
  (the upload runs via API in `before()`), so it was dropped (PORTING rule 2).
- Rule 1: `findByText(string)` → `getByText(str, { exact: true })`;
  `should("not.exist")` → `toHaveCount(0)`; `should("be.visible")` → `toBeVisible()`.
  Column headers are single matches under `table-header`, so no `.first()` needed.

## Dividends
- None. Clean straight-through port; the shared content-translation +
  static-embedding helper surface from the two precedent specs covered a
  `{ question }` embed with zero new code — a reuse dividend worth noting for any
  remaining content-translation specs.
