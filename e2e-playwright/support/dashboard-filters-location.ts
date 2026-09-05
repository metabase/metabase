/**
 * Data for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-location.cy.spec.js
 *
 * Everything the spec needs behaviourally is imported read-only from the shared
 * modules (setFilter / saveDashboard / filterWidget / selectDashboardFilter /
 * getDashboardCard / editDashboard from dashboard.ts, clearFilterWidget from
 * dashboard-parameters.ts, addWidgetStringFilter / selectFilterValueFromList /
 * clickDefaultValueToggle / waitForDashcardQuery from
 * dashboard-filters-text-category.ts). This file only carries the fixture data,
 * which had no shared home.
 */

/**
 * Port of DASHBOARD_LOCATION_FILTERS
 * (e2e/test/scenarios/dashboard-filters/shared/dashboard-filters-location.js).
 * Keyed by the location operator; `value` is entered through the widget and
 * `representativeResult` is a number expected in the resulting dashcard rows.
 */
export type LocationFilter = {
  value: string;
  representativeResult: string;
};

export const DASHBOARD_LOCATION_FILTERS: Record<string, LocationFilter> = {
  Is: {
    value: "Abbeville",
    representativeResult: "1510",
  },
  "Is not": {
    value: "Abbeville",
    representativeResult: "37.65",
  },
  Contains: {
    value: "Abb",
    representativeResult: "1510",
  },
  "Does not contain": {
    value: "Abb",
    representativeResult: "37.65",
  },
  "Starts with": {
    value: "Abb",
    representativeResult: "1510",
  },
  "Ends with": {
    value: "y",
    representativeResult: "115.24",
  },
};
