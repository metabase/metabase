# data-studio-library (slot 5)

Source: `e2e/test/scenarios/data-studio/data-studio-library.cy.spec.ts` (540 lines, 13 `it`s)
Target: `e2e-playwright/tests/data-studio-library.spec.ts` + `e2e-playwright/support/data-studio-library.ts`

Result: **13/13 pass on the jar** — every upstream `it` ported 1:1, none merged,
dropped or weakened. Stable under `--repeat-each=2` (26/26). `tsc --noEmit` clean.
**Nothing gate-skipped** — the pro-self-hosted token is present locally, so all
tests genuinely executed.

## Fixes needed while porting

Exactly one, and it was in my own added assertion, not in the port of upstream
behaviour:

- **Metric "Duplicate" goes through `POST /api/card`, not `POST /api/card/:id/copy`.**
  `CardCopyModal` uses `useCreateCardMutation`
  (`frontend/src/metabase/questions/components/CardCopyModal/CardCopyModal.tsx:17`)
  even though `metabase/api/card.ts:239` does define a `copyCard` mutation
  against `/api/card/:id/copy`. Category: *new gotcha, minor* — if you anchor a
  duplicate-flow port on the "obvious" copy endpoint you burn a 30s
  `waitForResponse` and the failure looks like the duplicate never happened,
  while the page has in fact already navigated to the new card.

No upstream-behaviour fixes were needed. The port ran green on the first jar
run apart from that one line.

## Vacuous / missing upstream assertions (dividends)

- **`"should let you move metrics into the library, even when empty"` has NO
  assertion whatsoever.** It ends on `H.modal().button("Duplicate").click()`.
  Whether the duplicate succeeded, landed in the library's Metrics collection,
  or 500'd, the test is green — it only proves the buttons are clickable.
  Ported as a REAL assertion: anchor on the `POST /api/card` response, assert
  `status === 200` and `collection_id === <library-metrics collection id>`.
  This is the test's stated intent ("move metrics into the library"), so the
  strengthening is faithful, and it is also what makes the test deterministic
  under Playwright (upstream relied on Cypress's command-queue latency to let
  the request finish before teardown).

- Weaker instances of the same shape, ported as-is because they still assert
  something: `should show the library collection even if only 1 child
  collection has items` ends on `.should("exist")` for a picker row (ported as
  `toHaveCount(1)`), and `should allow you to publish a table` uses
  `should("exist")` where `be.visible` would be meaningful. Not worth a
  behaviour change; flagged only so the pattern is on record.

## Porting gotchas worth adding to PORTING.md

1. **`CardCopyModal` duplicates via `POST /api/card`** (above). Generalise: for
   any "Duplicate" flow, read the modal component before picking the endpoint —
   the REST-shaped endpoint existing in `metabase/api/*.ts` does not mean the UI
   uses it.
2. **`.closest('[role="row"]')` ports better as a row-filter than an xpath
   walk.** `H.DataStudio.Library.result(name)` is
   `findByText(name).closest('[role="row"]')`. Porting it as
   `getByText(...).locator("xpath=ancestor::*[@role='row']")` puts the assertion
   subject one resolution away from the row; the assertions that follow are on
   the row itself (`aria-level`). Building it as
   `libraryPage.locator('[role="row"]').filter({ has: page.getByText(name, { exact: true }) })`
   is both more direct and dodges the deepest-vs-outermost ambiguity of
   `getByText` on nested `Ellipsified` cells. Note the `has` sub-locator is built
   from `page`, per the existing wave-11 rule.
3. **TreeTable row semantics are stable and worth reusing**: rows carry
   `role="row"` + `aria-level={depth+1}`
   (`frontend/src/metabase/ui/.../TreeTableRow.tsx:91,109`), the expand chevron
   is an `ActionIcon` with `aria-label` `Expand`/`Collapse`
   (`ExpandButton.tsx`), and name cells carry `data-testid="${model}-name"`
   (`useLibraryTreeTableInstance.tsx:151`). Any future data-studio TreeTable port
   (library, snippets, dependency lists) can lean on these rather than CSS.

## Consolidation debt spotted

- **`dataStudioNav` is now defined in FOUR modules**: `data-reference.ts`,
  `schema-viewer.ts`, `remote-sync.ts`(listed in INDEX) and now
  `data-studio-library.ts` — all byte-identical
  `page.getByTestId("data-studio-nav")`. Ports of `H.DataStudio.nav()`. Promote
  one copy (Cypress has exactly one, so consolidating is faithful).
- **The snowplow no-op stub block** is copy-pasted again here, making it at
  least five modules (`homepage.ts`, `datamodel-segments.ts`,
  `segments-data-studio.ts`, `remote-sync.ts`, `data-studio-library.ts`). The
  existing PORTING consolidation note already flags this; this port raises its
  priority.
- **`createCollection(api, name)`** now exists in at least four modules
  (`collections-trash.ts`, `collections-cleanup.ts`, `dashboard-core.ts`,
  `search.ts`, and mine). All are subsets of the same `H.createCollection`.
  `support/factories.ts` is the natural home.
- `H.DataStudio.Tables.*` locators (`table-overview-page`, `table-pane-header`)
  and `H.DataStudio.breadcrumbs()` are now split between `measures-queries.ts`
  and my module — a single `support/data-studio.ts` mirroring the one Cypress
  `DataStudio` object would be the faithful shape.

## Explicitly NOT verified

- **Snowplow.** The two events the first test checks (`data_studio_opened` with
  `triggered_from: "nav_menu"`, and `data_studio_library_created`) are stubbed
  to no-ops per PORTING rule 6 and left as `TODO(snowplow)` comments in the
  spec. The UI actions that fire them do run; the events themselves are
  unasserted. That test's remaining assertions (empty state → create → three
  root collections appear) are real.
- CI behaviour. Verified only against the local
  `target/uberjar/metabase.jar` (COMMIT-ID `751c2a98`), single worker, slot 5.
  No Cypress cross-check was run — none was needed, since nothing failed in a
  way that needed a fidelity or product-bug adjudication.
