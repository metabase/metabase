# measures-published-tables

Source: `e2e/test/scenarios/data-studio/measures/measures-published-tables.cy.spec.ts` (155 lines, 7 tests)
Target: `e2e-playwright/tests/measures-published-tables.spec.ts`
New helper module: `e2e-playwright/support/measures-published-tables.ts` (routes + `measuresTab` only)

Result: **7/7 executed and passing on the jar** (COMMIT-ID `751c2a98`, verified via
`/api/session/properties` `version.hash` = `751c2a9`). Stable at `--repeat-each=3`
(21/21) and `--repeat-each=2` (14/14). `tsc --noEmit` clean for my files (the only
errors in the tree are a sibling agent's pre-existing `support/sdk-embed-setup.ts`
Locator/Page mismatches).

0 gate-skips, 0 upstream-skip carries, 0 fixmes.

## No dividends

No product bugs, no vacuous upstream assertions, no silently-discarded helper
arguments. Upstream's `createTestMeasure` accepts a `description` option that no
call site passes — that's an unused *parameter*, not a discarded one (the helper
does forward it), so there is nothing to strengthen. Every URL/visibility
assertion in the original is real and enforced; mutation-checked below.

## Consolidation debt: NOT made worse

The brief flagged the two existing `MeasureEditor` objects. I added **no third
one**. `support/measures-data-studio.ts` is the fuller of the two (it already
carries `getActionsButton` and `getBreadcrumb`, which `measures-queries.ts` does
not) and its locators are route-agnostic — the published-table pages render the
same `table-measures-page` / `new-measure-page` / `measure-detail-page` testids
— so `MeasureList`, `MeasureEditor`, `createMeasure`, `waitForCreateMeasure`,
`waitForUpdateMeasure` are all imported from it read-only.

My new module carries only what genuinely did not exist: the three
`/data-studio/library/tables/:id/measures[…]` routes and the "Measures" tab
locator. It is deliberately the exact shape `support/published-tables-segments.ts`
already took for the segments routes — those two files are an obvious pair to
merge in a later consolidation pass (a single `published-tables.ts` with
`visitPublishedTable{Segments,Measures}Page` + the tab locators).

`H.createLibrary()` + `H.publishTables({table_ids:[ORDERS_ID]})` is byte-for-byte
the existing shared `createLibraryWithTable(api)` — reused, not re-implemented.

## New gotcha (proposed for PORTING.md): unkeyed breadcrumb prepend swaps the anchor under a resolved locator

Worth adding — it is a *concrete, source-verified* instance of the existing
"a list that re-renders under a resolved locator clicks the WRONG ROW" rule, and
the diagnosis path is genuinely misleading.

`should navigate back to published table measures via breadcrumb` failed
intermittently in a full-file run and **3/3 in isolation**, always with:

```
Expected substring: "/data-studio/library/tables/5/measures"
Received string:    "http://localhost:4101/data-studio/library"
```

Mechanism, from `frontend/src/metabase/data-studio/common/components/Breadcrumbs/PublishedTableBreadcrumbs.tsx`:

```tsx
{path?.map((collection, i) => (
  <Link key={collection.id} to={Urls.dataStudioLibrary({...})}>{collection.name}</Link>
))}
<Link to={tableListUrl}>{table.display_name}</Link>
```

Before `useCollectionPath` resolves, `path` is undefined and the **first** anchor
in the list is the table crumb ("Orders" → `…/tables/5/measures`). When the path
resolves, the collection links are **prepended**; they are keyed by collection id
while the table link is positional, so React reuses the existing first anchor
node — the element a locator already resolved as "Orders" becomes "Data" with
`href="/data-studio/library"`, and the click goes there.

Two things make this expensive to diagnose:

1. **An `href` gate does not close the window.** I measured it: gating on
   `expect(crumb).toHaveAttribute("href", "…/tables/5/measures")` before clicking
   still failed 2 of 3 runs. The href is *correct* right up until the swap, so
   the gate reads green and the click still misroutes. (Generalises: attribute
   gates are useless against node-reuse races — the attribute is only wrong
   after the moment you stopped looking.)
2. **A page-readiness gate is not enough either.** `expect(measure-detail-page).toBeVisible()`
   fixed it 3/3 in a single-test run and still failed once in a 21-run
   full-file sweep. The detail page mounts before the collection-path fetch
   resolves, so it does not bracket the window.

The gate that works — and that is grounded in the component rather than guessed —
is to wait for the **collection crumb** ("Data") to be present before resolving
the table crumb, because that is exactly the render that performs the swap.
Green 21/21 and 14/14 afterwards.

This is harness pacing, **not** a product bug and **not** port drift: Cypress's
command-queue latency between `cy.visit` and `cy.findByText(...).click()` always
cleared the window, so upstream never sees it. No cross-check or bug claim is
implied. (I did not investigate whether the unkeyed positional child is worth
fixing in the app — a `key` on the table `<Link>` would make the node reuse
impossible — but flagging it is cheap and it would remove a real class of user-
visible misclick during breadcrumb load.)

## Snowplow

Not applicable, and no stub added. Unlike its sibling
`measures-data-studio.cy.spec.ts`, this spec never calls a snowplow helper —
there is nothing incidental to stub and nothing to capture. Recorded here only
so a later reader does not assume rule 6 was skipped by oversight.

## Mutation checks on the negative assertions

Both `not.*` assertions were verified to fail for the right reason, with the
rest of the file still green in the same run (5 passed / 2 failed):

- Removing the `tableOverviewTab().click()` in the tabs test → only
  `should navigate between Overview, Fields, and Measures tabs` failed
  (the `not.toContain("/measures")` assertion). The preceding
  `toContain("/data-studio/library/tables/:id")` is satisfied by the measures
  URL too, so this negative assertion is the one carrying the test.
- Removing the breadcrumb click → only
  `should navigate back to published table measures via breadcrumb` failed.

## Port notes worth keeping

- `cy.url().should(...)` is retried in Cypress → every URL check is `expect.poll`,
  never a one-shot read.
- `H.undoToast().should("contain.text", …)` → `toContainText` on
  `undoToast(page).first()` (transient-duplicate-toast gotcha).
- `cy.intercept(...).as("createMeasure"/"updateMeasure")` → `waitForCreateMeasure` /
  `waitForUpdateMeasure` registered before the triggering click. Both are awaited
  upstream, so neither was dropped.
- The `@EE` gate (`resolveToken("pro-self-hosted")`) is present but **does not
  fire** locally or on CI — all 7 tests execute. It only guards a token-less env.
