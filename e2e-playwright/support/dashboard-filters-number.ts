/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-number.cy.spec.js
 *
 * Everything else the spec needs is imported read-only from shared modules:
 * setFilter / saveDashboard / editDashboard / filterWidget / selectDashboardFilter
 * / getDashboardCard / sidebar from dashboard.ts, clearFilterWidget from
 * dashboard-parameters.ts, dashboardSaveButton / clickDefaultValueToggle from
 * dashboard-filters-text-category.ts, toggleRequiredParameter from
 * embedding-dashboard.ts, dashboardParametersDoneButton from filters-repros-2.ts,
 * ensureDashboardCardHasText / resetFilterWidgetToDefault from
 * temporal-unit-parameters.ts, assertCardRowsCount from
 * dashboard-filters-auto-apply.ts, removeFieldValuesValue from native-filters.ts.
 *
 * This file only carries what had no home yet:
 * - DASHBOARD_NUMBER_FILTERS (port of the shared data table)
 * - addWidgetNumberFilter (port of the number branch of
 *   native-filters/helpers/e2e-field-filter-helpers.js)
 * - setFilterWidgetValue (port of H.setFilterWidgetValue,
 *   e2e-ui-elements-helpers.js — no earlier port needed it)
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "./dashboard";
import { removeFieldValuesValue } from "./native-filters";
import { popover } from "./ui";

/**
 * Port of DASHBOARD_NUMBER_FILTERS
 * (e2e/test/scenarios/dashboard-filters/shared/dashboard-filters-number.js).
 */
export type NumberFilter = {
  operator: string;
  value: string | [string, string];
  representativeResult: string;
  single?: boolean;
};

export const DASHBOARD_NUMBER_FILTERS: NumberFilter[] = [
  {
    operator: "Equal to",
    value: "2.07",
    representativeResult: "37.65",
  },
  {
    operator: "Equal to",
    value: "2.07",
    representativeResult: "37.65",
    single: true,
  },
  {
    operator: "Not equal to",
    value: "2.07",
    representativeResult: "110.93",
  },
  {
    operator: "Not equal to",
    value: "2.07",
    representativeResult: "110.93",
    single: true,
  },
  {
    operator: "Between",
    value: ["3", "5"],
    representativeResult: "68.23",
  },
  {
    operator: "Greater than or equal to",
    value: "6.01",
    representativeResult: "110.93",
  },
  {
    operator: "Less than or equal to",
    value: "2",
    representativeResult: "29.8",
  },
];

/**
 * Port of addWidgetNumberFilter (native-filters/helpers/e2e-field-filter-helpers.js):
 * a two-element array is a Between filter (fill both "Enter a number" inputs);
 * otherwise a single value. The confirm button lives inside the value popover.
 * `fill()` is safe here — number inputs start empty (each opens on a fresh
 * widget) and carry no debounce/typeahead behaviour (unlike the token fields in
 * the text/category port).
 */
export async function addWidgetNumberFilter(
  page: Page,
  value: string | [string, string],
  { buttonLabel = "Add filter" }: { buttonLabel?: string } = {},
) {
  const pop = popover(page).first();
  if (Array.isArray(value)) {
    const [low, high] = value;
    await pop.getByPlaceholder("Enter a number").nth(0).fill(low);
    await pop.getByPlaceholder("Enter a number").nth(1).fill(high);
  } else {
    await pop.getByPlaceholder("Enter a number").fill(value);
  }
  await pop.getByRole("button", { name: buttonLabel, exact: true }).click();
}

/**
 * Port of H.setFilterWidgetValue (e2e-ui-elements-helpers.js): open the first
 * filter widget, drop the current token value, optionally type a new one, then
 * confirm. A null value just removes the token and clicks the confirm button
 * (e.g. "Set to default").
 */
export async function setFilterWidgetValue(
  page: Page,
  value: string | null,
  targetPlaceholder: string,
  { buttonLabel = "Update filter" }: { buttonLabel?: string } = {},
) {
  await filterWidget(page).first().click();
  const pop = popover(page).first();
  await removeFieldValuesValue(pop, 0);
  if (value) {
    const input = pop.getByPlaceholder(targetPlaceholder);
    await input.fill(value);
    await input.blur();
  }
  await pop
    .getByRole("button", { name: buttonLabel, exact: true })
    .click({ force: true });
}
