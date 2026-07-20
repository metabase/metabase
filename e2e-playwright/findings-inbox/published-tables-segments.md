# published-tables-segments

Port of `e2e/test/scenarios/data-studio/published-tables-segments.cy.spec.ts`
(159 lines, 7 tests) → `tests/published-tables-segments.spec.ts`.

**Result: 7/7 executed and green on the jar (COMMIT-ID 751c2a98, verified via
`/api/session/properties` → `version.hash` = `751c2a9`). 0 skipped, 0 fixme.
`bunx tsc --noEmit` clean.** Stable at `--repeat-each=2` (14/14) and
`--repeat-each=3` (21/21).

## No product-bug dividends

Nothing here rises to a finding about the app. The one failure encountered was
port drift and is described below because the *mechanism* is a known-class
gotcha that bit again on a new surface.

## Gotcha (already in PORTING, new instance): breadcrumb node reuse

`SegmentEditor.getBreadcrumb(page, "Orders")` (= `getByText("Orders", {exact})`)
clicked **deterministically wrong** — 3/3 runs landed on `/data-studio/library`
instead of `/data-studio/library/tables/5/segments`.

Cause, confirmed by instrumenting the resolved node: on the way to a segment
detail page the app first paints the *table* page's shorter breadcrumb trail,
then swaps in the 4-crumb segment trail (`Library > Data > Orders > <segment>`).
React **reuses the anchor DOM nodes and rewrites their text**, so the node
Playwright resolved while it read "Orders" is, by click time, the
`<a href="/data-studio/library">Library</a>` crumb. Proof: logging the resolved
element's `outerHTML` immediately before the click printed the Library anchor,
and re-resolving after the settle raised a strict-mode violation naming the
*table-name textarea* as a second "Orders" — i.e. the DOM under the locator was
a different page at resolve time.

This is exactly PORTING's "a list that re-renders under a resolved locator
clicks the WRONG ROW". Worth noting it is **not limited to lists/pickers** —
Mantine `Breadcrumbs` has the same reconciliation shape, and the failure has the
same evil fingerprint (element present, stable, in place, and now a different
thing; no actionability error).

Fix (in-spec, no shared-helper edit): gate on the settled trail before
resolving the crumb —

```ts
await expect(page.getByTestId("data-studio-breadcrumbs")).toContainText(
  "Breadcrumb Nav Test",       // the 4th crumb only exists in the final state
);
await expect(SegmentEditor.getBreadcrumb(page, "Orders")).toHaveAttribute(
  "href", publishedTableSegmentsUrl(ORDERS_ID),
);
```

The href assertion alone was **not** sufficient (1 failure in 2 runs); the
segment-name gate is what makes it deterministic. 23/23 consecutive passes
after. One unexplained failure of this test did occur during a mutation run
after the fix and before the 23-run streak — recorded honestly rather than
written off, though nothing reproduced it in 23 subsequent attempts and the
box had sibling agents running.

## Mutation checks (negative/at-risk assertions)

Three simultaneous mutants, expecting only the owning test to die:

| mutant | expected victim | actual |
| --- | --- | --- |
| `url().not.toContain("/segments")` → `toContain` (tab-nav test) | tab-nav | died ✓ |
| toast text `"Segment removed"` → `"Segment removedZZ"` | deletion | died ✓ |
| filter column `Total` → `Subtotal` (creation test) | creation | **survived** |

The surviving mutant is **not vacuity** — this spec's creation test
deliberately asserts only "a segment was created and we redirected", and never
the filter description. (The sibling `segments-data-studio` port *does* assert
`Total is greater than 100`, which is where that coverage lives.) Recorded so
nobody re-derives it as a hole.

## Gating

`test.skip(!hasToken)` on `pro-self-hosted`, matching the `H.activateToken` in
the upstream `beforeEach` (the library and published-tables endpoints are
token-gated). The token resolves locally, so **all 7 tests executed** — none of
this is gate-skipped coverage.

## Snowplow

None. This spec neither resets nor asserts snowplow, so neither the rule-6 stub
block nor `installSnowplowCapture` applies — nothing was stubbed and nothing was
weakened.

## Helper surface

New module `support/published-tables-segments.ts` (3 exports:
`publishedTableSegmentsUrl`, `visitPublishedTableSegmentsPage`,
`visitPublishedTableSegmentPage`, plus `tableSegmentsTab`). Everything else is
imported read-only:

- `SegmentList` / `SegmentEditor` from `support/segments-data-studio.ts` — the
  published-tables pages render the *same* `table-segments-page` /
  `new-segment-page` / `segment-detail-page` testids as the data-model surface,
  so the whole locator object ports across with zero change. Good evidence that
  module is the right home for the segments surface.
- `tableOverviewTab` / `tableFieldsTab` / `visitTableOverviewPage` from
  `support/data-studio-tables.ts`; `undoToast` from `metrics.ts`;
  `selectFilterOperator` from `joins.ts`; `createSegment` from `filter-bulk.ts`;
  `popover` / `modal` from `ui.ts`.

**Consolidation note:** `data-studio-tables.ts` carries `tableOverviewTab` /
`tableFieldsTab` / `tableDependenciesTab` but not `segmentsTab` / `measuresTab`,
so this port had to add `tableSegmentsTab` in a new file for a one-line locator.
When the data-studio modules are consolidated, fold the full
`H.DataStudio.Tables` tab set (and the `visitSegmentsPage` / `visitSegmentPage`
/ `visitMeasuresPage` / `visitMeasurePage` route helpers) into one module —
Cypress has exactly one copy of each, so consolidating stays faithful.
