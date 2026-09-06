/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-location.cy.spec.js
 *
 * Location dashboard filters mapped to a City column: connecting each operator
 * (Is / Is not / Contains / Does not contain / Starts with / Ends with),
 * entering values through the widget, applying, verifying the resulting rows,
 * and clearing. Plus a default-value case.
 *
 * Notes on the port:
 * - Upstream drives every operator's value entry through addWidgetStringFilter
 *   (type into the widget + "Add filter"), including the Is/Is not list widgets,
 *   so the port does the same rather than routing Is/Is not through the value
 *   list. Faithful to the original.
 * - `cy.contains(representativeResult)` is a case-sensitive substring, first
 *   match. The results are numeric so case is moot; ported as getByText(...).first()
 *   (rule 3 — cy.contains == .first()).
 * - `cy.wait("@dashcardQuery<id>")` after clearing a filter: the single dashcard
 *   means the generic waitForDashcardQuery matcher is equivalent. Registered
 *   BEFORE the clear (the triggering action), awaited after (rule 2).
 * - `cy.findByText("Default value").next().click()` -> clickDefaultValueToggle,
 *   which targets [aria-labelledby="default-value-label"] directly.
 */
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
} from "../support/dashboard";
import { clearFilterWidget } from "../support/dashboard-parameters";
import { DASHBOARD_LOCATION_FILTERS } from "../support/dashboard-filters-location";
import {
  addWidgetStringFilter,
  clickDefaultValueToggle,
  selectFilterValueFromList,
  waitForDashcardQuery,
} from "../support/dashboard-filters-text-category";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > location", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
  });

  test("should work when set through the filter widget", async ({ page }) => {
    for (const filter of Object.keys(DASHBOARD_LOCATION_FILTERS)) {
      await setFilter(page, "Location", filter);
      await selectDashboardFilter(getDashboardCard(page), "City");
    }
    await saveDashboard(page);

    const entries = Object.entries(DASHBOARD_LOCATION_FILTERS);
    for (let index = 0; index < entries.length; index++) {
      const [, { value, representativeResult }] = entries[index];

      await filterWidget(page).nth(index).click();
      await addWidgetStringFilter(page, value);

      await expect(
        getDashboardCard(page).getByText(representativeResult).first(),
      ).toBeVisible();

      const dashcardQuery = waitForDashcardQuery(page);
      await clearFilterWidget(page, index);
      await dashcardQuery;
    }
  });

  test("should work when set as the default filter", async ({ page }) => {
    await setFilter(page, "Location", "Is");
    await selectDashboardFilter(getDashboardCard(page), "City");

    await clickDefaultValueToggle(page);
    await selectFilterValueFromList(page, "Abbeville");

    await saveDashboard(page);

    await expect(getDashboardCard(page).getByText("1510").first()).toBeVisible();
  });
});
