# questions-entity-id

Source: `e2e/test/scenarios/question/questions-entity-id.cy.spec.ts` → `tests/questions-entity-id.spec.ts`
New helper module: `support/questions-entity-id.ts` (`ORDERS_QUESTION_ENTITY_ID`, `main`).

## Result
3 tests, all green on the jar (slot 3, COMMIT-ID 751c2a98). 6/6 under `--repeat-each=2`. tsc clean.

## Fixes / port decisions (all mechanical — no product bugs, no fixmes)
- `cy.url().should("contain", …)` (Cypress auto-retries) → `expect.poll(() => page.url()).toContain(…)` — the eid→id redirect lands asynchronously after `page.goto` resolves. A one-shot `page.url()` check races the redirect (PORTING gotcha: retried URL/hash assertions must be `expect.poll`).
- `cy.intercept("GET","/api/card/12").as(...)` + `cy.get("@wrongCardRequest.all").should("have.length", 0)` → `page.on("request")` collecting exact-pathname `/api/card/12` GETs into an array, asserted length 0 at the end. Chosen over `page.route` because the test only counts occurrences, never fulfils.
- `cy.wait("@entityIdRequest")` → `page.waitForResponse` on POST `/api/eid-translation/translate` registered BEFORE the goto (rule 2). This is the ordering guard that gives the "wrong" request time to fire before the count assertion.
- `H.main()` re-implemented locally (`main`) rather than editing a shared file — it's currently duplicated across 4 support modules (metrics-reproductions, models-reproductions-2, sharing, viz-tabular-repros). **Consolidation candidate:** a single shared `main(page)`.
- `ORDERS_QUESTION_ENTITY_ID` is not exported by shared `support/sample-data.ts` (only the numeric id is) — derived in the new module from the same `cypress_sample_instance_data.json`. **Consolidation candidate:** add `ORDERS_QUESTION_ENTITY_ID` (and other eids) to `sample-data.ts` alongside the numeric ids.

## Dividends
None — clean 1:1 port of stable behaviour (eid URL resolution + 404 path).
