/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-number.cy.spec.js
 *
 * Number dashboard filters: connecting each operator (Equal to / Not equal to /
 * Between / Greater than or equal to / Less than or equal to), entering values
 * through the widget, applying, verifying the resulting rows/result, resetting,
 * default values, and the required-parameter flow.
 *
 * Notes on the port:
 * - The Cypress beforeEach registers `cy.intercept("GET",
 *   "/api/table/*\/query_metadata").as("metadata")`, but no test ever waits on
 *   `@metadata` — dropped per PORTING rule 2.
 * - The `@dashboardData` alias (POST dashcard query) IS awaited throughout;
 *   ported as waitForDashcardQuery registered BEFORE the triggering action and
 *   awaited after (rule 2). There is a single dashcard, so the generic matcher
 *   is unambiguous.
 * - The "A single value" radio: click the label then assert the radio is
 *   checked (the real Mantine radio input is hidden — clicking it directly is
 *   not actionable). Mirrors the text/category port.
 * - Disabled Save / Done buttons carry Mantine tooltips; hover with
 *   { force: true } (the disabled control does not itself receive pointer
 *   events) and filter the tooltip by text (a lingering sibling tooltip would
 *   otherwise make a bare getByRole("tooltip") match two elements).
 */
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { assertCardRowsCount } from "../support/dashboard-filters-auto-apply";
import {
  DASHBOARD_NUMBER_FILTERS,
  addWidgetNumberFilter,
  setFilterWidgetValue,
} from "../support/dashboard-filters-number";
import { clearFilterWidget } from "../support/dashboard-parameters";
import {
  clickDefaultValueToggle,
  dashboardSaveButton,
  waitForDashcardQuery,
} from "../support/dashboard-filters-text-category";
import { toggleRequiredParameter } from "../support/embedding-dashboard";
import { dashboardParametersDoneButton } from "../support/filters-repros-2";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  ensureDashboardCardHasText,
  resetFilterWidgetToDefault,
} from "../support/temporal-unit-parameters";
import { popover, visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > number", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
  });

  test("should work when set through the filter widget", async ({ page }) => {
    for (const { operator, single } of DASHBOARD_NUMBER_FILTERS) {
      await setFilter(page, "Number", operator);

      if (single) {
        await sidebar(page).getByText("A single value", { exact: true }).click();
        await expect(
          sidebar(page).getByRole("radio", {
            name: "A single value",
            exact: true,
          }),
        ).toBeChecked();
      }

      await page.getByText("Select…", { exact: true }).click();
      await popover(page).getByText("Tax", { exact: true }).first().click();
    }

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    for (const [
      index,
      { value, representativeResult },
    ] of DASHBOARD_NUMBER_FILTERS.entries()) {
      await filterWidget(page).nth(index).click();
      const appliedQuery = waitForDashcardQuery(page);
      await addWidgetNumberFilter(page, value);
      await appliedQuery;

      await expect(page.getByTestId("dashcard")).toContainText(
        representativeResult,
      );

      const clearedQuery = waitForDashcardQuery(page);
      await clearFilterWidget(page, index);
      await clearedQuery;
    }
  });

  test("should work when set as the default filter", async ({ page }) => {
    await setFilter(page, "Number", "Equal to");
    await selectDashboardFilter(page.getByTestId("dashcard"), "Tax");
    await clickDefaultValueToggle(page);

    await addWidgetNumberFilter(page, "2.07");

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;

    const dashcard = page.getByTestId("dashcard");
    await expect(dashcard).toContainText("37.65");
    await expect(dashcard).not.toContainText("101.04");

    const clearedQuery = waitForDashcardQuery(page);
    await clearFilterWidget(page);
    await clearedQuery;

    await filterWidget(page).click();
    const updatedQuery = waitForDashcardQuery(page);
    await addWidgetNumberFilter(page, "5.27", { buttonLabel: "Update filter" });
    await updatedQuery;

    await expect(dashcard).toContainText("101.04");
    await expect(dashcard).not.toContainText("37.65");
  });

  test("should support being required", async ({ page }) => {
    await setFilter(page, "Number", "Equal to", "Equal to");
    await selectDashboardFilter(page.getByTestId("dashcard"), "Tax");

    // Can't save without a default value
    await toggleRequiredParameter(page);
    await expect(dashboardSaveButton(page)).toBeDisabled();
    await dashboardSaveButton(page).hover({ force: true });
    await expect(
      page.getByRole("tooltip").filter({
        hasText:
          'The "Equal to" parameter requires a default value but none was provided.',
      }),
    ).toBeVisible();

    // Can't close sidebar without a default value
    await expect(dashboardParametersDoneButton(page)).toBeDisabled();
    await dashboardParametersDoneButton(page).hover({ force: true });
    await expect(
      page.getByRole("tooltip").filter({
        hasText:
          "The parameter requires a default value but none was provided.",
      }),
    ).toBeVisible();

    await clickDefaultValueToggle(page);
    await addWidgetNumberFilter(page, "2.07", { buttonLabel: "Update filter" });

    const savedQuery = waitForDashcardQuery(page);
    await saveDashboard(page);
    await savedQuery;
    await ensureDashboardCardHasText(page, "37.65");

    // Updates the filter value
    const updatedQuery = waitForDashcardQuery(page);
    await setFilterWidgetValue(page, "5.27", "Enter a number");
    await updatedQuery;
    await ensureDashboardCardHasText(page, "95.77");

    // Resets the value back by clicking widget icon
    const resetQuery = waitForDashcardQuery(page);
    await resetFilterWidgetToDefault(page);
    await expect(
      filterWidget(page).getByText("2.07", { exact: true }),
    ).toBeVisible();
    await resetQuery;
    await ensureDashboardCardHasText(page, "37.65");

    // Removing value resets back to default
    await setFilterWidgetValue(page, null, "Enter a number", {
      buttonLabel: "Set to default",
    });
    await expect(
      filterWidget(page).getByText("2.07", { exact: true }),
    ).toBeVisible();
    await ensureDashboardCardHasText(page, "37.65");
  });

  test("should allow between filters without min or max (metabase#54364)", async ({
    page,
  }) => {
    const minInput = () =>
      popover(page).first().getByPlaceholder("Enter a number").nth(0);
    const maxInput = () =>
      popover(page).first().getByPlaceholder("Enter a number").nth(1);

    await setFilter(page, "Number", "Between");
    await selectDashboardFilter(getDashboardCard(page), "Total");
    await saveDashboard(page);

    // min only
    await filterWidget(page).click();
    await expect(
      popover(page).first().getByPlaceholder("Enter a number"),
    ).toHaveCount(2);
    await minInput().fill("150");
    await popover(page)
      .first()
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await assertCardRowsCount(getDashboardCard(page), 256);

    // max only
    await filterWidget(page).click();
    await minInput().fill("");
    await maxInput().fill("20");
    await popover(page)
      .first()
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await assertCardRowsCount(getDashboardCard(page), 52);

    // min and max only
    await filterWidget(page).click();
    await minInput().fill("150");
    await maxInput().fill("155");
    await popover(page)
      .first()
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await assertCardRowsCount(getDashboardCard(page), 166);
  });
});
