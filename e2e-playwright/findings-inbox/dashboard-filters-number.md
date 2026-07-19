# dashboard-filters-number

Port of `dashboard-filters/dashboard-filters-number.cy.spec.js` → `tests/dashboard-filters-number.spec.ts`.
4/4 tests green on the jar (slot 3), 8/8 under `--repeat-each=2`. tsc clean.

## Result

No product bugs, no fixmes, no dividends. A clean, faithful port that leaned
entirely on the text/category precedent (`dashboard-filters-text-category.spec.ts`)
and existing shared helpers.

## New helpers (support/dashboard-filters-number.ts only)

- `DASHBOARD_NUMBER_FILTERS` — port of the shared data table.
- `addWidgetNumberFilter` — port of the number branch of
  `native-filters/helpers/e2e-field-filter-helpers.js`. Array value → Between
  (two "Enter a number" inputs); else single. `fill()` is safe (inputs open
  empty, no debounce/typeahead — unlike the text token fields).
- `setFilterWidgetValue` — port of `H.setFilterWidgetValue`
  (e2e-ui-elements-helpers.js); no earlier port needed it. Reuses the shared
  `removeFieldValuesValue` (native-filters.ts).

Everything else imported read-only (setFilter/saveDashboard/filterWidget/
selectDashboardFilter/getDashboardCard/sidebar, clearFilterWidget,
dashboardSaveButton/clickDefaultValueToggle/waitForDashcardQuery,
toggleRequiredParameter, dashboardParametersDoneButton,
ensureDashboardCardHasText/resetFilterWidgetToDefault, assertCardRowsCount).

## Fixes classified (all "known gotcha" — the brief/precedent already covered them)

- Dropped the never-awaited `@metadata` intercept (rule 2).
- `@dashboardData` → waitForDashcardQuery registered-before / awaited-after (rule 2).
- "A single value" radio: click the label, assert the radio checked (hidden
  Mantine input isn't clickable) — mirrors the text/category port.
- Disabled Save/Done tooltips: `hover({ force: true })` + tooltip filtered by
  text (lingering sibling tooltip would make a bare getByRole("tooltip") match
  two) — mirrors the text/category port.

## Consolidation note

`setFilterWidgetValue` is a generic `H` helper (not number-specific) that had no
port yet — a future pass could move it to a shared UI-elements module alongside
`clearFilterWidget`/`resetFilterWidgetToDefault` rather than leaving it in this
spec's helper file.
