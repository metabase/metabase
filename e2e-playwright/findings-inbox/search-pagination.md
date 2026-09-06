# search-pagination.cy.spec.js → tests/search-pagination.spec.ts

3 tests ported, 3/3 green on the jar (slot 2), 6/6 under `--repeat-each=2`. tsc clean.
New helpers → `support/search-pagination.ts` (no shared files edited; imports
command-palette locators, `createQuestion` factory, `popover`, `search` read-only).

## Fixes classified

- **Known gotcha (mixed-content text node).** `cy.findByText("1 - 50")` targets the
  PaginationControls range span whose full textContent is `"1 - 50 of 51"` (nested
  `<span>`s for " of " and the total). testing-library's `getNodeText` matches only
  the element's direct TEXT_NODE children ("1 - 50"), so Cypress passed; Playwright's
  exact `getByText` compares full textContent and found nothing. Ported as a scoped
  substring regex: `getByLabel("pagination").getByText(new RegExp("1 - 50"))`. Scoping
  to the `aria-label="pagination"` nav avoids a strict-mode match against the parent.
  (PORTING "Mixed-content text nodes" rule.)

- **Over-added register-before-trigger wait on a cached page change.** I first wrapped
  every pagination click in `waitForSearch` (rule 2). Next-page fetches a new page and
  resolves, but **Previous-page returns to an RTK-Query-cached page and fires no
  `/api/search` at all** → the wait timed out (30s). Upstream never waited on
  pagination clicks; it relied on Cypress auto-retry. Removed the waits on Next/Previous
  and let Playwright's auto-retrying `toHaveCount`/`getByText` settle the re-render.
  Lesson: register-before-trigger only applies when a request actually fires — a
  page-change that may hit cache is not a guaranteed trigger.

- **Empty-string test: scope to `q`-carrying searches.** Upstream fails on ANY
  `/api/search`, but the app fires a query-less `?models=dataset&limit=1&context=basic-actions`
  prefetch on load that Cypress/Electron didn't see in this flow. The test is about
  *typing* not triggering a search, so the request listener counts only searches with a
  `q` param (the search-on-string). Faithful to intent.

## Adaptations (not bugs)

- `H.commandPaletteSearch(query)` defaults `viewAll = true` — it clicks "View and
  filter all results" to reach the full-page `/search` app where pagination lives. The
  shared `filters-repros.commandPaletteSearch` only implements the `viewAll:false`
  branch, so a viewAll variant lives in `support/search-pagination.ts`.
- The Cypress `before()` seeds 51 questions into a `"many-questions"` snapshot; ported
  as the standard once-per-worker `snapshotReady` flag + `mb.restore("many-questions")`.
- Added `waitForCardsIndexed` (poll + one force-reindex) because card indexing is async
  after restore and `mb.restore()`'s readiness poll only guarantees a *table* is
  searchable — a search fired too early returned < 51 and the FE never re-queries.

## Dividends

None. No product-bug or fixme claims; all behaviour matches on the jar.
