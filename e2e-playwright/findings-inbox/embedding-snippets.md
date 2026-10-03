# embedding-snippets

Port of `e2e/test/scenarios/embedding/embedding-snippets.cy.spec.js` →
`tests/embedding-snippets.spec.ts`.

- Size: 4 tests (2 tests × 2 tokens: starter, pro-self-hosted). All faithful,
  no test.fixme.
- Verified on the jar (COMMIT-ID 751c2a98), slot 1: 4/4 green first run,
  8/8 green under `--repeat-each=2`. tsc clean (only pre-existing errors in
  content-translation-upload-and-download.ts, unrelated).

## New helpers
- `support/embedding-snippets.ts` (new file): `getEmbeddingJsCode` / `IFRAME_CODE`
  (typed re-ports of `e2e/.../shared/embedding-snippets.js`, matched with `.*`
  for secret-key/site-url so they're per-worker-backend-agnostic), plus
  `codeBlock`, `highlightedTexts`, `backendSelectButton`, `frontendSelectButton`,
  `toggleAppearanceControl`.

## Fixes / classifications (all known gotchas — no new ones)
- Appearance Switches (background / download toggles) are visually-hidden inputs
  Mantine parks outside the modal viewport → `dispatchEvent("click")`
  (`toggleAppearanceControl`), same pattern already documented in
  public-sharing-embed-button-behavior. Known gotcha.
- Rule 1: `cy.findByText(str)` existence checks ported as
  `getByText(...).toBeVisible()`.
- `codeBlock().invoke("text").should("match", regex)` → read `.textContent()`
  and `toMatch(regex)`; `should("have.text", IFRAME_CODE)` → `toHaveText`. The
  language `<select>` value asserts via `toHaveValue`.

## Notes
- Upstream passes `acceptTerms: false` to `H.openLegacyStaticEmbeddingModal`,
  which the helper does not accept — a dead arg. Dropped; the port uses the
  helper default `unpublishBeforeOpen: true` (matches upstream behaviour).
- No infra gates: static-embedding code snippets need only the EE jar + token
  (both starter and pro-self-hosted resolve from cypress.env.json). No external
  DB / email / webhook.

## Consolidation dividend (flagged, not acted on)
- `toggleAppearanceControl` (dispatched-click on parked appearance Switches) is
  now defined identically in two places: `support/embedding-snippets.ts` and
  spec-local in `tests/public-sharing-embed-button-behavior.spec.ts`. Candidate
  to promote into `support/embedding.ts` for both to import.
