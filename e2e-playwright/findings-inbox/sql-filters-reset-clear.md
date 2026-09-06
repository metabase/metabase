# sql-filters-reset-clear

Port of `native-filters/sql-filters-reset-clear.cy.spec.ts` (824 lines) →
`tests/sql-filters-reset-clear.spec.ts`. All 4 tests ported faithfully; jar
slot 9, 8/8 green under `--repeat-each=2`. No `test.fixme`, no product-bug
claims. New helpers in `support/sql-filters-reset-clear.ts` only.

## Fixes classified

- **Known gotcha (rule 5 / caret-at-end family) — stale label locator during a
  self-relabelling input.** The sidebar's required default-value widget is
  labelled "Default filter widget value (required)" while empty, but the
  accessible name drops "(required)" the instant a value is entered — behaviour
  the Cypress spec depends on (`updateValue("… (required)", v)` then asserts on
  the non-required label). A label-based Playwright locator therefore goes stale
  mid-sequence: click/clear/type succeeded, then `.blur()` re-resolved
  `getByLabel("… (required)")` against a node that no longer carries that name
  and timed out. Cypress resolves the DOM node ONCE (jQuery subject) and drives
  focus/clear/type/blur on that node; Playwright re-resolves the locator per
  action. Fix: `setInputValue` resolves the input to a single `elementHandle()`
  up front and runs every keystroke + the final blur through the handle, so it
  targets the same node regardless of the aria-label change. (The combobox path
  is unaffected — it addresses the popover, not a changing label.)

## Notes / no dividend

- Faithful port, no strengthening or app bugs found. The four types (text /
  number / date / field) share `checkNativeParametersInput` (text+number) and
  `checkNativeParametersDropdown` (date+field) plus per-type sidebar checks,
  mirroring the Cypress module structure.
- Reused existing helpers rather than duplicating: card creation via
  `createNativeQuestionWithParameters` (native-filters-extras — `parameters`
  optional, so called with just `native`), load via `visitQuestionEitherEndpoint`
  (native-extras) since an API-created native card can load dirty and run through
  `/api/dataset` instead of `/api/card/:id/query`. `popover`/`icon` from ui.ts.
- Status icons (WidgetStatus: close/revert/chevrondown) render INSIDE the
  ParameterValueWidgetTrigger, but the Cypress helpers reach them via
  `filter(label).parent().icon(...)`; `.locator("..").locator(".Icon-*")`
  resolves the same node (Cypress `.parent().find()` searches all descendants).
- Field `updateValue` commits with the literal "Update filter" button (matching
  Cypress); date `updateValue` keeps the `/(Add|Update) filter/` regex because
  the date default-value popover's button label varies.
