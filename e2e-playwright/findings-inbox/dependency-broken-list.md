# dependency-broken-list

Port of `e2e/test/scenarios/dependencies/dependency-broken-list.cy.spec.ts`
(576 lines, 9 tests) → `tests/dependency-broken-list.spec.ts`.
New helpers: `support/dependency-broken-list.ts`.

## Verification status — read this before quoting numbers

**9/9 tests gate-skipped. Zero executed. No runtime verification whatsoever.**

The spec is `@external` by construction: its entire fixture is a *transform*
that writes `test_transform_table` into the writable QA postgres DB
(`WRITABLE_DB_ID`), which is then broken by rewriting the transform's SQL to
emit `score_new`/`status_new`. It needs (a) the `postgres-writable` snapshot,
(b) a live QA postgres container, (c) a `pro-self-hosted` token. Docker is not
running on this box and neither the snapshot nor the container exists in the jar
harness (nor in CI's `-@external` leg), so the describe is gated on
`PW_QA_DB_ENABLED` per the `dependency-graph` / `dependency-unreferenced-list`
precedent.

- Jar run: 9 skipped. `--repeat-each=2`: 18 skipped. `bunx tsc --noEmit`: clean.
- A green run here means **"correctly skipped"**, not "passing". No Cypress
  cross-check was run either — it would die in the same `beforeEach`.

This is the third spec in this domain with the same shape (actions-on-dashboards
made the same point in wave 11). The port is faithful-by-construction; that is
all that can be claimed.

## Fixes needed

None — no test ever executed, so nothing was debugged. The port applied the
known gotchas prophylactically:

- **Rule 2 / re-rendering list**: upstream `visitBrokenDependencies` is a bare
  `cy.visit` (unlike its `visitUnreferencedEntities` sibling, which does
  intercept + wait). Cypress's retrying `findByText` covers the async load;
  Playwright resolves once, and PORTING's "a list that re-renders under a
  resolved locator clicks the WRONG ROW" applies directly to this virtualized
  list. The port anchors on `GET /api/ee/dependencies/graph/breaking` +
  `list` visible before returning.
- **Locator-scoped `has`**: `checkListSorting` builds the `has` text locator
  from `page`, not from the `list` Locator (wave-11 collections gotcha).
- **Rule 1**: every `findByText` ported as `{ exact: true }`.
- **Snowplow → no-op stubs** (rule 6), with the TODO block.

## Vacuous / weak upstream assertions

No genuinely vacuous assertion found. Two weaknesses worth recording, both
**unverified** (I could not run the tests to confirm the underlying counts):

1. **Three of the four sorting tests assert the same expected order.**
   `BROKEN_DEPENDENCIES_SORTED_BY_LOCATION`,
   `BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS` and
   `BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS` are the *same three
   names in the same order* (`[question, model, table]`). So "sort by Problems"
   and "sort by Broken dependents" cannot distinguish their column from the
   Location sort — any of the three sorts would satisfy the other two's
   assertions. Not vacuous (the descending case still flips), but the
   discriminating power is much lower than the four separate tests suggest.
   Fixing it needs fixture data with distinct orderings per column, which is an
   upstream change, not a port change — ported 1:1.

2. **Likely tied sort keys.** Upstream's own comments say the "Problems" counts
   are `1 error (PRICE)`, `1 error (AMOUNT)`, `1 error (SCORE) + 1 soft` — i.e.
   two of the three rows tie at 1. An assertion on a total order over tied keys
   depends on an unspecified secondary sort. If this spec ever flakes in the
   ordering tests, that is the first place to look. Flagged, not changed.

## Porting gotchas worth adding to PORTING.md

Two, both small:

- **`*/` inside a JSDoc header terminates the comment.** Writing
  "the create\*/getTableId factories are imported read-only" in the spec's
  header block ends the block comment mid-sentence; the rest of the header parses
  as code and `tsc` reports four syntax errors pointing at the *import list*,
  not at the comment. Cheap to hit because the "create\*" shorthand is the house
  style for describing ported factory helpers. Write `createQuestion / getTableId`.
- **`MetabaseApi` has `get`/`post`/`put` shorthands but no `delete`.** Ports of
  `cy.request("DELETE", ...)` must go through `api.fetch("DELETE", url)`.
  (`dropTransformTable` here.) Worth one line in the helper catalog.

## Consolidation debt spotted

- **`DependencyDiagnostics` is split across two modules and about to be split
  across three.** The locator object lives in
  `support/dependency-unreferenced-list.ts`, but it is the *shared*
  `e2e-dependency-helpers.ts` surface — `dependency-graph.ts` already carries
  `DependencyGraph` + `waitForBackfillComplete` + `createTransform`, and this
  port had to add `visitBrokenDependencies`, `BrokenSidebar.missingColumnsSection`
  and `BrokenSidebar.brokenDependentsSection` in a *fourth* place because agents
  may not edit shared modules. The upstream helper file is one cohesive module;
  the port should be too. **Proposed: `support/dependencies.ts`** holding
  `DependencyGraph`, `DependencyDiagnostics` (all three visit* + full `Sidebar`
  incl. `errorsSection`), `waitForBackfillComplete`,
  `waitForGraphDependencies`, `waitForUnreferencedEntities`,
  `waitForBreakingDependencies` — this consolidates *toward a shape Cypress
  already has*, so it passes the faithfulness-over-DRY test.
- **Transform run helpers are duplicated.** `dependency-graph.ts` has
  `createTransform` + `runTransformAndWaitForSuccess` (polls one run);
  this port needed the raw `runTransform` + `waitForTransformRuns` (asserts over
  the whole run list). Upstream keeps both in `e2e-transform-helpers.ts`.
  Proposed: `support/transforms.ts` with `createTransform`, `runTransform`,
  `runTransformAndWaitForStatus/Success/Failure`, `waitForTransformRuns`.
- `getFieldId` lives in `support/table-editing.ts` and `getTableId` /
  `resyncDatabase` in `support/schema-viewer.ts`, though both are ports of
  `e2e-qa-databases-helpers.js`. Every writable-DB spec now imports from two
  unrelated-sounding modules. Low priority, but it makes the QA-DB surface hard
  to find from `INDEX.md`.

## Dividends

None. Nothing was strengthened, no product behaviour was observed, and no bug is
claimed — there was no executable coverage to observe anything with.
