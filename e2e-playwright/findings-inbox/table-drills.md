# table-drills

Port of `visualizations-tabular/drillthroughs/table_drills.cy.spec.js`
→ `tests/table-drills.spec.ts`. 13 tests (26 under `--repeat-each=2`), all
green on the jar (slot 4). New helpers in `support/table-drills.ts` only.

## Fixes classified

- **Known gotcha (mixed-content text nodes) — 1 fix.** The date-extraction
  drill option renders its title and example in one label as
  `"Year"` (bare text node) + `<div>"2026, 2027"</div>`, so the element text is
  `"Year2026, 2027"`. `getByText("Year", { exact: true })` matched nothing and
  timed out (Issue 40061 test). Faithful port per the PORTING.md
  mixed-content-text-nodes rule: case-sensitive substring regex `getByText(/Year/)`
  — "Year" (capital Y) deliberately avoids the lowercase "year" in the sibling
  options "Quarter of year" / "Month of year". Same class as the wave-9
  "Slack is not configured" note; no product bug (Cypress `findByText` matched
  the title's direct text node, which testing-library does and Playwright doesn't).

- **cy.contains → case-sensitive regex substring (rule / known).** All the
  `cy.get("[data-testid=cell-data]").contains(str)` cell drills ported to
  `getByTestId("cell-data").filter({ hasText: <case-sensitive regex> }).first()`.

- **`cy.icon(name).should("be.visible")` is an ANY-match (rule 3 / wave-9).**
  The column click-actions popovers assert `arrow_down`/`arrow_up`/`gear` icons;
  ported via `expectIconVisible` (`.filter({ visible: true }).first()`).

## Helpers added (support/table-drills.ts)

- `mockDevelopmentMode(page, devMode)` — route `/api/session/properties` and
  overwrite nested `token-features.development_mode` (mirrors the spec's
  `cy.intercept` that toggled dev mode for the `[false, true]` matrix). Modeled
  on admin-extras `mockSessionProperty` (native fetch, not `route.fetch`).
- `openTable(page, { table, limit })` / `openReviewsTable(page, { limit })` —
  H.openTable/openReviewsTable with a row `limit`. The shared `binning.ts`
  `openTable` drops `limit`, which this spec needs (`{ limit: 3 }`, `{ limit: 1 }`).
- `expectIconVisible(page, testId, name)` — the any-match icon assertion.

## Dividends

None — no product bug found. The one non-trivial failure was a faithful-port
gap (exact vs substring on mixed-content text), fixed in the port.

## Consolidation notes (non-blocking)

- `openTable`-with-`limit` overlaps the shared `binning.ts openTable` (which
  ignores `limit`). A consolidation pass could add an optional `limit` to the
  shared helper and drop the local copy.
