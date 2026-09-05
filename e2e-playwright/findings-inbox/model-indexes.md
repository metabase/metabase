# model-indexes.cy.spec.js → tests/model-indexes.spec.ts

Source: `e2e/test/scenarios/models/model-indexes.cy.spec.js` (233 lines).
New helper module: `support/model-indexes.ts`.

## Result

- 5 tests ported, issue numbers kept exact (#31407 redux-cache comment).
  4 execute and pass; 1 is `it.skip` upstream ("record outside the first
  2000") → ported as `test.skip` faithfully.
- Verified on the CI EE uberjar (`target/uberjar/metabase.jar`, COMMIT-ID
  751c2a98), slot 3: **4/4 pass, 8/8 under `--repeat-each=2`**. tsc clean for
  both new files.
- No `test.fixme` / product-bug claims — nothing to cross-check.

## Fixes classified

### Known-gotcha miss (fixed): model metadata-editor column selection is
`onFocus`-driven, and the shared `openColumnOptions` doesn't reliably trigger it

`editTitleMetadata`/`openColumnOptions("ID")` need to select a non-first column
in the model metadata editor. The shared `models-metadata.openColumnOptions`
clicks the outer `header-cell`, which worked in `models-metadata.spec.ts`
(Orders "Subtotal") but **silently failed here for the Products model's "Title"
column**: the sidebar stayed on the first column (ID), the switch never rendered,
and the toggle click burned its full timeout.

Root cause (read from source): `DatasetEditorInner.renderSelectableTableColumnHeader`
wires selection to `onFocus` on the inner `data-testid="model-column-header-content"`
element (it has `tabIndex`), *not* an `onClick` on the cell. A center-click on the
outer `header-cell` doesn't always move focus to that inner div; when it doesn't,
`focusFirstField` (the effect that focuses column 0 once the query result lands)
reverts the selection to ID. Confirmed by instrumentation: clicking the header
cell → Display name stayed "ID"; `.focus()` on `model-column-header-content` →
Display name "Title" and the "Surface individual records" switch appeared.

Fix: new `selectModelColumn(page, column)` (support/model-indexes.ts) focuses the
`model-column-header-content` element directly (the exact event selection listens
for; also auto-scrolls) and asserts the sidebar Display name flipped. Also added
`waitForLoaderToBeRemoved` before selecting, mirroring models-metadata (avoids the
`focusFirstField` race window).

**Consolidation candidate / latent flake:** the shared `models-metadata.openColumnOptions`
is unreliable for the same reason — it only works when the outer-cell click
happens to land focus on the inner div. Worth reworking it to focus
`model-column-header-content` (fold `selectModelColumn` into it) so the other
models specs don't carry the same latent flake.

### Known gotcha (handled): async indexed-entity search readiness

Creating a model index (`POST /api/model-index` returns `state:"indexed"`
synchronously) populates the **indexed-entity search entries out-of-band**. A
command-palette search fired immediately can miss them and render a permanent
empty state (the FE never re-queries — same failure mode `mb.restore()` guards
against for the base index). `waitForIndexedValueSearchable(api, query)` polls
`/api/search?...&models=indexed-entity` (nudging `force-reindex` once) before the
palette search. Tests 3 and 5 were green from the first run with this in place.

## Port notes

- `@cardGet.all` length assertion (`expectCardQueries`) → `trackCardGets(page)`,
  a `page.on("response")` counter for GET `/api/card/:id` (single path segment —
  the Cypress glob `/api/card/*` does not match `/api/card/:id/query_metadata`).
- `@dataset` / `@modelIndexCreate` / `@modelIndexDelete` / `@cardUpdate`
  intercepts → `waitForResponse` promises registered before the Save click;
  request body read via `response.request().postDataJSON()`, response via
  `response.json()`.
- Mantine index toggle: `getByLabel(/surface individual records/i).click({force})`
  (rule 4) — resolves fine once the correct column is selected.
- "Edit metadata" carries a completeness badge in the actions menu, so it's
  matched with a regex (substring), not exact `getByText` (same as
  models-metadata).
- `H.commandPaletteSearch(q, false)` → shared `filters-repros.commandPaletteSearch`;
  `createModelIndex` ported into the new module (GET query_metadata for
  non-deterministic field ids, then POST, mirroring the Cypress helper's
  response-shape assertions).
