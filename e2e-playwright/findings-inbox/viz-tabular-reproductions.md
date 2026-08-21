# visualizations-tabular-reproductions

Port of
`e2e/test/scenarios/visualizations-tabular/visualizations-tabular-reproductions.cy.spec.js`
→ `tests/visualizations-tabular-reproductions.spec.ts` (27 tests). All 27 pass on
the jar (slot 1); 54/54 under `--repeat-each=2`. tsc clean. No `test.fixme`, no
product-bug claims. New helpers: `support/viz-tabular-repros.ts`.

## Fixes classified

### Known gotchas (the port should have avoided; brief could be tighter)

- **#63745 — `getByLabel` is substring; testing-library `findByLabelText` is
  exact.** `getByTestId("orders-table-columns").getByLabel("ID")` matched ID,
  User ID, Product ID (3). Needed `{ exact: true }`. (Rule 1 generalised to
  getByLabel.)

- **#56771 — a header cell that matches by text can be rendered twice / one is
  a zero-width measurement clone** (rule 3 family). `.filter({hasText}).first()`
  hit a 0-width node. Fixed by taking `Math.max` of the boundingBox widths.

- **#30039 — hover-gated `detail-shortcut` needs a real hittable box.** Cypress
  force-clicks it while hidden; Playwright's force still needs geometry. Hover the
  row (`[data-index]`) first, then click. (Rule 4.)

- **#30039 / #55673 — parked cursor + Escape.** Both tests press Escape to
  dismiss a popover/modal; parked the mouse (`page.mouse.move(0,0)`) first so a
  hover-tooltip can't swallow the key (wave-9 gotcha). Both passed either way here,
  but kept the guard.

- **#56094 — disabled descendant of a control that handles the click at the
  root.** `QuestionDisplayToggle` is a Mantine `SegmentedControl` whose two
  options are `disabled: true`; toggling happens on the root `onClick`. The
  labelled `<Icon>` is therefore a disabled descendant → Playwright refuses the
  click. `click({ force: true })` (the aria/boolean-disabled-ancestor gotcha,
  wave-10). Verified against `QuestionDisplayToggle.tsx`.

### `cy.wait` after a non-triggering action (known gotcha)

- **#15353 — renaming a pivot column *title* is a client-side viz setting and
  fires no query.** The Cypress `cy.wait("@pivotDataset")` was satisfied
  retroactively by an earlier pivot request (cy.wait consumes past ones); ported
  literally it hangs 30s. Dropped the wait — the "Count renamed" render is the
  assertion. (Snapshot confirmed the rename applied and the pivot re-rendered
  client-side with no network call.)

### Environmental adaptation, NOT a bug or drift (#42049)

- The saved question loads via `POST /api/card/:id/query`, but applying a filter
  via the filter header re-runs it **ad-hoc via `POST /api/dataset`** on this
  build. Verified with a network probe (control): initial `→ /api/card/98/query`,
  post-filter `→ /api/dataset`. The Cypress UI steps are identical, so the
  original would route the same way on this jar — its intercept + assertion are
  **card-only** (`cy.get("@cardQuery.all").should("have.length", 2)`), which is
  not literally satisfiable here.
  Faithful adaptation: apply the same `cols[1].field_ref` rewrite (the whole point
  of the test — simulate a *named* field ref in the query response) on **whichever
  endpoint the query uses** (`/api/card/:id/query` for load, `/api/dataset` for
  the filtered re-run), wait for the second query on either endpoint, and assert
  the real thing (column order stays ID / Created At / Quantity). Not raised as a
  product bug: the observable behaviour (column order preserved) holds; only the
  card-query *count* differs, and that is a routing characteristic of this build.

## Migration dividends

None. No Cypress-masked bugs surfaced; all 27 tests reflect existing behaviour.

## New helpers (support/viz-tabular-repros.ts)

- `ADMIN_USER_ID` — looked up like sample-data.ts does for other ids (#23076).
- `main`, `queryBuilderFooterDisplayToggle`, `resizeTableColumn` — H-helper ports
  not in the shared modules. `resizeTableColumn` reproduces Cypress's synthetic
  `mousedown@0 → mousemove@moveX` as a **+moveX delta** real-mouse drag (verified:
  ID 62 → 162).
- `assertEChartsTooltip` + `echartsTooltip` + `hoverLineDot` — tooltip
  header/rows/marker-colour assertions (#11435). Consolidation candidate with
  metrics-explorer.ts `echartsTooltip`.
- `expectDisplayValueVisible` / `expectNoDisplayValue` / `getControlByDisplayValue`
  — `cy.findByDisplayValue` ports scanning input/textarea/select (overlaps
  pivot-tables.ts `findDisplayValue`, filters-repros.ts `findByDisplayValue`;
  these add the visible / not-exist / get-and-type variants).
- `createVizQuestion` / `createNativeVizQuestion` — thin typed wrappers so the
  object literals can carry `visualization_settings` (the shared api.createQuestion
  / createNativeCard omit it from their param types but forward it at runtime).
