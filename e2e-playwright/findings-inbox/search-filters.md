# search-filters (search/search-filters.cy.spec.js → tests/search-filters.spec.ts)

66 tests, all green on the jar (slot 5), all green under `--repeat-each=2`, tsc
clean. New helpers live in `support/search-filters.ts` only; everything else
imported read-only (search.ts, search-pagination.ts, factories.ts,
command-palette.ts, model-indexes.ts, actions-on-dashboards.ts,
documents-core.ts, collections-trash.ts, ui.ts).

## Gate / EE

- **Verified filter is EE and IS active on the jar.** Content verification
  (`verified` search filter, `verified_filled icon`, `POST /api/moderation-review`)
  requires the `pro-self-hosted` token; the jar is EE and the token is present in
  repo-root `cypress.env.json` (`MB_PRO_SELF_HOSTED_TOKEN`), so the describe runs
  and passes. Gated with `test.skip(!resolveToken("pro-self-hosted"))` +
  `activateToken` in beforeEach per rule 7 — no infra gap.
- The type filter exercises Action / Indexed-record / Document result types
  (all EE-adjacent) and they all resolve on the jar — no infra gate needed.

## Classified fixes made while stabilizing (all harness/port issues, not app bugs)

1. **`last_edited_by` q2 attribution — Cypress command-ordering dependency.**
   Upstream's second `H.createQuestion(...).then(...)` runs *after* the first
   `.then` chain, so it executes while the **normal** user is still signed in
   → q2 ("Robert's Super Duper Reviews") is created by the normal user and then
   edited by admin. Porting the two creates as sequential admin calls made
   creator == editor. *Known-gotcha-adjacent* (Cypress's `create*` helpers /
   queue semantics are non-obvious — PORTING already warns "create* helpers are
   not thin wrappers"); worth an explicit line: **the queue also decides which
   session a later command runs under.** Fixed by recreating q2 under the normal
   session.

2. **"Updated …" vs "Created …" needs a ≥1s gap between create and edit.**
   `InfoTextEditedInfo.tsx:52-54` renders "Updated" only when
   `!dayjs(last_edited_at).isSame(created_at, "seconds")`. An API edit fired
   <1s after `createQuestion` lands in the *same second* → the result renders
   "Created … by <creator>" and every `last_edited_*` timestamp assertion fails.
   The Cypress UI flow (open QB → summarize → Done → save) was always slow enough
   to clear the second boundary; a fast API edit is not. `editQuestionByAddingSummarize`
   waits 1.1s before the PUT. **New gotcha — candidate for PORTING.md:** *when a
   test asserts "Updated …" attribution, the edit must land at least one second
   after creation; an instant API edit reads as "Created".*

3. **API edit must be a real QUERY change sent as a fresh LEGACY dataset_query.**
   A description-only PUT bumps the search index's `last_editor_id` (so a
   last-editor poll passes) but the FE still renders "Created" — its
   Created/Updated decision needs a content revision, not just a new editor.
   And echoing the card's stored **MBQL 5** `dataset_query` back with a `query`
   key added is rejected 400 ("MBQL 4 keys … not allowed in MBQL 5 queries").
   Fix: PUT a fresh legacy `{type:"query", database, query:{...original, aggregation:[["count"]]}}`.
   The two dead ends (description-only; echo-back MBQL5) are each a plausible
   port that fails in a non-obvious way.

4. **Async indexing after post-restore content creation / edits / archive.**
   `mb.restore()`'s readiness poll only guarantees a *table* is searchable.
   Three separate places needed explicit index readiness (all faithful to the
   "async indexing after restore" rule, extended to post-restore *mutations*):
   - type-filter setup seeds model/action/model-index/document →
     `waitForModelIndexed` per new type before the type search runs;
   - last_edited describes → `waitForLastEditors` polls `last_editor_id` in the
     card search (force-reindex re-nudged periodically, throws on 60s timeout);
   - trashed-items → the archive indexes async and the one-shot `reload()` could
     fire its search first; wrapped reload+assert in `toPass` so it reloads until
     the trash entry appears.

## Notes on faithful mechanical ports (no dividend, just recording decisions)

- `should("have.attr","aria-label").and("match", /type$/)` on every result →
  explicit loop over `search-result-item` asserting `toHaveAttribute(regex)`.
- `findByLabelText("close icon" | "verified_filled icon" | "Verified items only")`
  are aria-labels → `getByLabel(..., { exact: true })`.
- `cy.url().should("not.contain"/"contain", ...)` → `expect.poll(() => …url)`
  (one-shot URL checks catch transient states — the wave-5 hash/URL rule).
- `H.commandPaletteSearch(q)` (default viewAll) → the search-pagination.ts port
  that clicks "View and filter all results" and lands on the full-page search app.

## Consolidation candidates surfaced

- `expectSearchResultItemNameContent` (this file) is a near-duplicate of the
  spec-local name-content asserter several search specs carry inline; a shared
  home in `support/search.ts` alongside `expectSearchResultContent` would fit.
- The three async-index readiness pollers here (`waitForModelIndexed`,
  `waitForLastEditors`) join `waitForCardsIndexed` (search-pagination.ts) and
  `waitForIndexedValueSearchable` (model-indexes.ts) — five variants of the same
  "poll the search endpoint, force-reindex once/periodically" shape. A single
  parameterised `waitForSearchIndexed(api, {q, model, predicate})` would absorb
  all of them.
