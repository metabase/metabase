# data-studio-metrics

Source: `e2e/test/scenarios/data-studio/data-studio-metrics.cy.spec.ts` (432 lines)
Target: `e2e-playwright/tests/data-studio-metrics.spec.ts` + `support/data-studio-metrics.ts`

Result: **11/11 passing on the CI uberjar** (COMMIT-ID `751c2a98`, verified via
`/api/session/properties` → `version.hash 751c2a9` and hashed static assets),
**22/22 under `--repeat-each=2`**. `bunx tsc --noEmit` clean. No skips, no
fixmes, no gated tests — all 11 genuinely executed.

## Dividends

**None.** This spec is unusually well-written upstream: every assertion is a
real assertion, nothing was vacuous, and no test needed strengthening. Nothing
in it grounds a product-bug claim, and none is made.

## Snowplow: captured, not stubbed

PORTING rule 6 (stub to no-ops) does **not** apply here. Judged per test:

- The `analytics events` describe (2 tests) asserts *only* snowplow events —
  `metric_create_started` from browse-metrics and from the command palette,
  plus `metric_created`. Stubbing would have made both tests no-ops.
- The create test asserts two snowplow events (`metric_create_started` /
  `metric_created`) alongside its UI assertions. Those two are load-bearing on
  the `triggered_from` discriminator (`data_studio_library` vs `browse_metrics`
  vs `command_palette`), which is exactly the thing a stub cannot check.

So **all 5 snowplow assertions in the file are real**, via
`installSnowplowCapture` (`support/search-snowplow.ts`) — the browser-boundary
capture, no micro container. They pass, which is itself the proof the capture
reaches these code paths (`expectUnstructuredSnowplowEvent(..., 1)` cannot be
satisfied by an empty capture).

Note the documented Iglu-validation gap does **not** bite this spec: upstream
never calls `expectNoBadSnowplowEvents` here, so nothing was degraded. Upstream
also never calls `H.enableTracking()` — it relies on the snapshot default. The
capture forces the client-side settings on, which is at worst marginally more
deterministic than upstream, not weaker.

## Porting gotchas (nothing new — all previously documented rules applied)

Every fix needed was a *known gotcha*; the brief's pointers covered them. For
the feedback-loop record, the ones that actually mattered:

1. **EditableText rename** (wave 5) — the metric title is a `<textarea>` whose
   dirty flag only sets on real keystrokes, so `fill()` + Enter would fire no
   PUT. `renameMetricTitle` does click → `ControlOrMeta+A` → `keyboard.type` →
   register the PUT wait → Enter.
2. **`findByDisplayValue` must scan `textarea`** (wave 9) — same field. The
   shared `filters-repros.findByDisplayValue` is the correct one; the
   `dashboard-cards.inputWithValue` copy would have found nothing here.
3. **Mini-picker search input needs a real click before typing** (batch 12) —
   `NotebookDataPicker`'s `TextInput` opens the picker on `onClickCapture`;
   `pressSequentially` alone focuses without clicking, so the menu never opens.
4. **`locator.count()` does not retry** (batch 12) — the `menuitem` count check
   in the browse-metrics test is gated on a first-element visibility assertion
   before counting, otherwise the `>= 1` check reads a still-loading popover.
5. **Duplicate goes through `POST /api/card`**, not `/api/card/:id/copy`
   (batch 12, already documented from the metrics-explorer port) — the
   `@createCard` alias upstream is correct and the obvious `copy` endpoint would
   have burned 30s.
6. **`cy.url().should("match")` → `expect.poll`** (wave 5).
7. `cy.intercept("POST","/api/collection")` / `PUT /api/collection/*` are
   registered upstream and **never awaited** — dropped per rule 2, noted in the
   spec header.

## Minor upstream observation (not a dividend)

In "should move metric to different collection", the step
`cy.findByTestId("move-card-toast").findByText("First collection").click()` is
labelled `cy.log("Verify metric is in First collection")` but verifies nothing —
it navigates and the navigation's outcome is never asserted. The *actual*
verification is the `GET /api/card/:id` collection_id check that follows, which
is a real assertion. Ported literally (the click is kept, since removing it
would change what the page is doing when the API check runs). Not worth
strengthening: the API check already covers the intent.

## Consolidation debt

**The Cypress `MetricPage` object (`e2e/support/helpers/e2e-metric-page-helpers.ts`)
is now split across three port modules.** Cypress has exactly one copy, so
consolidating stays faithful (the standing rule):

- `support/metrics.ts` — `MetricPage.header` / `moreMenu` / `aboutPage`
- `support/metrics-editing.ts` — `MetricEditor.queryEditor` / `saveButton` /
  `cancelButton` / `aboutTab`, plus `runButtonInOverlay`
- `support/data-studio-metrics.ts` (new, mine) — `MetricDetail.definitionTab` /
  `dependenciesTab` / `aboutPageDescriptionSidebar` / `exploreLink`

Together these are the whole of the single upstream object. Merge into
`support/metrics.ts` as one `MetricPage`.

Also: `runButtonInOverlay` is now implemented **twice** (`metrics-editing.ts`,
`models-reproductions-2.ts`) — byte-identical, one Cypress source
(`e2e-misc-helpers.js`). Fold into `notebook.ts` or `ui.ts`.

**`dataStudioNav` was NOT duplicated a fifth time** — imported from
`support/data-studio-library.ts`, along with `metricMoreMenu`,
`libraryNewButton`, `visitLibrary` and `createLibraryWithItems`. The existing
×4 duplication of `dataStudioNav` (already on the batch-12 list) stands
unchanged.

`commandPaletteSearch` is imported from `search-snowplow.ts` for the
`viewAll: false` variant — the sixth call site of a helper Cypress has once.
Reinforces the batch-12 "parameterise it" item.
