# column_extract_drill

Source: `visualizations-tabular/drillthroughs/column_extract_drill.cy.spec.js`
Port: `tests/column-extract-drill.spec.ts` (+ `support/column-extract-drill.ts`)

8 tests, all green on the jar (slot 5), 16/16 under `--repeat-each=2`. tsc clean.
No fixmes, no product-bug claims → no cross-check needed.

## Fixes classified (all known gotchas — no new ones)

- **Mixed-content extraction option buttons.** The extract-drill option buttons
  render `title` ("Year") + `subTitle` example ("2026, 2027") inside ONE Mantine
  label element (`ClickActionControl.tsx:140-141`), so the element text is
  "Year2026, 2027" — exact `getByText` can't match. Ported the `option` match as
  a case-sensitive substring regex, which also lets `should("contain", example)`
  become `toContainText(example)` on that same element. Same class as the
  table-drills "Year2026, 2027" precedent (PORTING.md mixed-content-text-nodes).
  Case-sensitive "Year" avoids the lowercase "year" in "Quarter of year".
- **Snowplow → no-op stubs** (rule 6). The snowplow-tagged describe still runs
  the extraction; `resetSnowplow`/`expectNoBadSnowplowEvents`/
  `expectUnstructuredSnowplowEvent` are no-ops.
- **`cy.scrollTo("right")` instant → assign `scrollLeft = scrollWidth`** (the
  reducedMotion scrollTo gotcha; no duration was requested so a direct assign is
  faithful).
- **`cy.wait(1)`** (a 1ms no-op between the two drill clicks) dropped.
- Drill menus are popovers (`popover()` scope); `H.tableHeaderClick` →
  shared `notebook.ts tableHeaderClick`.

## Reused (no re-implementation)

- `openOrdersTable({ limit })` imported read-only from `column-shortcuts.ts`.
- `tableHeaderClick`/`enterCustomColumnDetails`/`openNotebook`/`getNotebookStep`/
  `visualize` (notebook.ts), `formatExpression`/`setModelMetadata`
  (custom-column-3.ts), `createQuestion` (factories), `visitQuestion`/`popover`
  (ui.ts), `tableInteractive`/`tableInteractiveBody`.

## New helpers (support/column-extract-drill.ts)

- `openPeopleTable({ limit })` — People-table twin of column-shortcuts'
  `openOrdersTable`. **Consolidation candidate**: the limit-aware simple-mode
  ad-hoc `open<Table>Table` family is now spread across column-shortcuts.ts,
  binning.ts, table-drills.ts and here — a single parameterised
  `openTable(page, { table, limit })` would absorb all of them.
- `extractColumnAndCheck` — the column-HEADER drill flavor (distinct from the
  "Add column" button flavor already in column-shortcuts.ts, which the
  column-shortcuts spec keeps). Same domain, different entry point.
