# dashboard-filters-location

Port of `dashboard-filters/dashboard-filters-location.cy.spec.js` →
`tests/dashboard-filters-location.spec.ts`. 2 tests.

## Result

Green on the jar (slot 2, EE uberjar COMMIT-ID 751c2a98): 2/2 first try, 4/4
under `--repeat-each=2`. tsc clean. No fixmes, no product bugs, no gotchas hit.

## Fixes / classification

None needed — clean port. No fidelity cross-check was required (nothing was
fixme'd or claimed as a bug).

## Migration dividend (helper reuse)

The whole behavioural surface was already available in shared modules — this
port added **zero** new helper functions. Only the fixture data
(`DASHBOARD_LOCATION_FILTERS`) needed a home (`support/dashboard-filters-location.ts`).
Reused as-is:

- `setFilter` / `saveDashboard` / `filterWidget` / `selectDashboardFilter` /
  `getDashboardCard` / `editDashboard` — `support/dashboard.ts`
- `clearFilterWidget` — `support/dashboard-parameters.ts`
- `addWidgetStringFilter` / `selectFilterValueFromList` / `clickDefaultValueToggle` /
  `waitForDashcardQuery` — `support/dashboard-filters-text-category.ts`

The text-category field-filter helpers (`addWidgetStringFilter`,
`selectFilterValueFromList`, `clickDefaultValueToggle`, `waitForDashcardQuery`)
are ports of `native-filters/helpers/e2e-field-filter-helpers.js` and dropped
straight into this sibling spec. Consolidation note: these four are generic
field-filter widget helpers currently living in the `text-category` module;
if a third dashboard-filter spec reaches for them they'd be worth promoting to
a neutral `field-filter.ts`.

## Faithful-port note

Upstream drives every operator's value entry — including the Is / Is not list
widgets — through `addWidgetStringFilter` (type into the widget input + click
"Add filter"), not through the value list. The port mirrors that exactly rather
than routing Is / Is not through `selectFilterValueFromList`; it passes on the
jar, confirming the typed-value path commits the list-backed City filter.
