# sql-filters-source

Port of `native-filters/sql-filters-source.cy.spec.js` (469 lines) →
`tests/sql-filters-source.spec.ts`. All 14 tests ported faithfully; jar slot 1,
28/28 green under `--repeat-each=2`. No `test.fixme`, no product-bug claims. New
helpers in `support/sql-filters-source.ts` only.

Covers a SQL template-tag filter whose dropdown values come from a configurable
source: connected field, custom list (dropdown + search box, with/without custom
labels), or another card/model — plus number-parameter variants and the
clear-and-restore-config-on-type-change test.

## Fixes classified

- **Known gotcha (rule 2 — cy.wait consumes past responses).** The
  "should properly cache parameter values api calls" test used
  `cy.wait("@parameterValues")` / `cy.wait("@cardParameterValues")` gates
  immediately after opening the value dropdown. The values fetch
  (`POST /api/dataset/parameter/values`, and post-save
  `GET /api/card/:id/params/:tag/values`) can fire *while the source is being
  configured*, before the dropdown is ever opened. Cypress's `cy.wait` matched
  it retroactively; a future-only `page.waitForResponse` registered at the open
  timed out (30s). Fix: drop the explicit response waits and gate on
  `checkFilterValueInList` (which already waits for the values to render, i.e.
  the fetch resolved). The `.all` length assertions
  (`cy.get("@parameterValues.all").should("have.length", 1)`) port to a
  `countRequests` counter registered at the top of the test — it must see every
  request, so it cannot be a per-open `waitForResponse`.

## Notes / no dividend

- Faithful port, no strengthening or app bugs found; cross-check not needed (no
  fixme/bug claim).
- Heavy helper reuse — the new file only carries what wasn't already ported:
  - Reused: `setFilterQuestionSource` / `setFilterListSource` (dashboard.ts),
    `chooseType` / `openTypePickerFromDefaultFilterType` / `mapFieldFilterTo` /
    `toggleRequired` / `fieldValuesCombobox` / `multiAutocompleteInput`
    (native-filters.ts), `createQuestion` / `createNativeQuestion`
    (factories.ts), `startNewNativeQuestion` / `typeInNativeEditor`
    (native-editor.ts), `saveQuestion` (sharing.ts), `countRequests`
    (dashboard-parameters.ts), `popover` / `icon` / `modal` (ui.ts).
  - New in `support/sql-filters-source.ts`: `openEntryForm`, `closeEntryForm`,
    `selectFilterValueFromList`, `setWidgetType` (FieldFilter.*);
    `setDropdownFilterType`, `setSearchBoxFilterType`, `setConnectedFieldSource`,
    `checkFilterListSourceHasValue` (the values-source `H` helpers dashboard.ts
    didn't port); `fieldValuesValue`, `multiAutocompleteValue`,
    `dashboardParametersPopover` (widget helpers); spec-local
    `checkFilterValueInList` / `checkFilterValueNotInList` / `updateQuestion`;
    and `runQuery(page, "cardQuery"|"dataset")` that waits on the exact endpoint
    the Cypress `@` alias named.
- **`SQLFilter.runQuery(alias)` → endpoint-specific wait.** The Cypress helper
  waits on whichever alias is passed: `"cardQuery"` (`POST /api/card/:id/query`,
  a clean saved question) vs `"dataset"` (`POST /api/dataset`, an unsaved/dirty
  one). Kept that distinction rather than collapsing to the either-endpoint
  helper, so each call still asserts the endpoint the original named.
- **Parameter-widget value assertions use `filterWidget()` not
  `getByLabel(name)`.** `cy.findByLabelText("Tag"|"X").should("contain.text", …)`
  ports to `expect(filterWidget(page)).toContainText(…)` — the documented
  native-parameter-widget duplicate-accessible-name gotcha would make
  `getByLabel` strict-mode-ambiguous, and the single `parameter-widget` testid
  is the same node.
- Dropped (never awaited in the original): the `@sessionProperties` intercept
  and the describe-level `@dataset` intercept. `enable-public-sharing` is set in
  `beforeEach` faithfully though no test exercises public sharing.
