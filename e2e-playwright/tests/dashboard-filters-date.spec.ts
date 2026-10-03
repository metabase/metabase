/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-date.cy.spec.js
 *
 * Date dashboard filters: connecting every date operator (Month and Year /
 * Quarter and Year / Single Date / Date Range / All Options), applying values
 * through the widget, verifying the resulting rows, resetting; plus default
 * values, the required-parameter flow, sub-day relative resolutions
 * (metabase#6660) and exclude-filter serialization on a non-English locale
 * (metabase#29122).
 *
 * DATE-ASSERTING — run with TZ=US/Pacific (CI sets it process-wide) or the
 * date-only fixtures shift a day.
 *
 * Notes on the port:
 * - The Cypress `@dashcardQuery${DASHCARD_ID}` alias was registered per-dashcard
 *   by H.visitDashboard. There is a single dashcard here, so the generic
 *   waitForDashcardQuery matcher is equivalent — registered BEFORE the clear
 *   action and awaited after (PORTING rule 2). The apply-query is covered by the
 *   retrying toContainText result assertion.
 * - The unawaited `@metadata` intercept in the Cypress beforeEach is dropped
 *   (never waited on).
 * - `cy.findByText("Default value").next().click()` / `cy.findByText("No default")`
 *   → clickDefaultValueToggle (the `[aria-labelledby="default-value-label"]`
 *   control after the label).
 * - `cy.contains("Include this minute")` is a mixed-content node ("Include" +
 *   <strong>this minute</strong>) → case-sensitive substring regex (rule 1).
 * - The disabled Save / Done buttons carry Mantine tooltips; hovering them uses
 *   { force: true } (the disabled control doesn't receive pointer events).
 */
import {
  dashboardHeader,
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  DASHBOARD_DATE_FILTERS,
  dateFilterSelector,
  setMonthAndYear,
} from "../support/dashboard-filters-date";
import {
  clickDefaultValueToggle,
  dashboardSaveButton,
  waitForDashcardQuery,
} from "../support/dashboard-filters-text-category";
import { clearFilterWidget } from "../support/dashboard-parameters";
import { toggleRequiredParameter } from "../support/embedding-dashboard";
import { dashboardParametersDoneButton } from "../support/filters-repros-2";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  ensureDashboardCardHasText,
  resetFilterWidgetToDefault,
} from "../support/temporal-unit-parameters";
import { icon, popover, visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > date", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
  });

  test("should work when set through the filter widget", async ({ page }) => {
    // Add and connect every single available date filter type
    for (const filter of Object.keys(DASHBOARD_DATE_FILTERS)) {
      await setFilter(page, "Date picker", filter);

      await page.getByText("Select…", { exact: true }).click();
      await popover(page).getByText("Created At", { exact: true }).first().click();
    }

    await saveDashboard(page);

    // Go through each of the filters and make sure they work individually
    const entries = Object.entries(DASHBOARD_DATE_FILTERS);
    for (let index = 0; index < entries.length; index++) {
      const [filter, { value, representativeResult }] = entries[index];

      await filterWidget(page).nth(index).click();

      await dateFilterSelector(page, {
        filterType: filter as keyof typeof DASHBOARD_DATE_FILTERS,
        filterValue: value,
      });

      await expect(page.getByTestId("dashcard").first()).toContainText(
        representativeResult,
      );

      const clearedQuery = waitForDashcardQuery(page);
      await clearFilterWidget(page, index);
      await clearedQuery;
    }
  });

  // Rather than going through every single filter type,
  // make sure the default filter works for just one of the available options
  test("should work when set as the default filter", async ({ page }) => {
    await setFilter(page, "Date picker", "Month and Year");
    await clickDefaultValueToggle(page);

    await setMonthAndYear(page, { month: "Nov", year: "2025" });

    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Created At", { exact: true }).first().click();

    await saveDashboard(page);

    // The default value should immediately be applied
    await expect(page.getByTestId("dashcard").first()).toContainText("85.88");

    // Make sure we can override the default value
    await page.getByText("November 2025", { exact: true }).click();
    await popover(page).getByText("Jun", { exact: true }).click();
    await expect(page.getByTestId("dashcard").first()).toContainText("33.9");
  });

  test("should support being required", async ({ page }) => {
    await setFilter(page, "Date picker", "Month and Year", "Month and Year");

    // Can't save without a default value
    await toggleRequiredParameter(page);
    await expect(dashboardSaveButton(page)).toBeDisabled();
    await dashboardSaveButton(page).hover({ force: true });
    await expect(
      page.getByRole("tooltip").filter({
        hasText:
          'The "Month and Year" parameter requires a default value but none was provided.',
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
    await setMonthAndYear(page, { month: "Nov", year: "2026" });

    await selectDashboardFilter(page.getByTestId("dashcard"), "Created At");
    await saveDashboard(page);

    // Updates the filter value
    await expect(filterWidget(page)).toContainText("November 2026");
    await filterWidget(page).click();
    await popover(page).getByText("Dec", { exact: true }).click();
    await expect(filterWidget(page)).toContainText("December 2026");
    await ensureDashboardCardHasText(page, "76.83");

    // Resets the value back by clicking widget icon
    await resetFilterWidgetToDefault(page);
    await expect(filterWidget(page)).toContainText("November 2026");
    await ensureDashboardCardHasText(page, "27.74");
  });

  test("should show sub-day resolutions in relative date filter (metabase#6660)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await setFilter(page, "Date picker", "All Options");

    await page.getByText("No default", { exact: true }).click();
    // click on Relative date range…, to open the relative date filter type tabs
    await popover(page)
      .getByText("Relative date range…", { exact: true })
      .click();
    // choose Next, under which the new options should be available
    await popover(page).getByText("Next", { exact: true }).click();
    // click on Days (the default value), which should open the resolution dropdown
    await (await findByDisplayValue(popover(page), "days")).click();
    // Hours should appear in the selection box (don't click it)
    await expect(popover(page).getByText("hours", { exact: true })).toBeVisible();
    // Minutes should appear in the selection box; click it
    await popover(page).getByText("minutes", { exact: true }).click();
    // also check the "Include this minute" checkbox. It's a Mantine Switch: the
    // label span intercepts pointer events for the underlying role=switch input,
    // so click the input (getByLabel resolves to it) with force (rule 4).
    await popover(page)
      .getByLabel(/Include this minute/)
      .click({ force: true });
  });

  test("correctly serializes exclude filter on non-English locales (metabase#29122)", async ({
    page,
    mb,
  }) => {
    const { id: userId } = await (await mb.api.get("/api/user/current")).json();
    await mb.api.put(`/api/user/${userId}`, { locale: "en_ZZ" });

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    // we can't use helpers as they use english words
    await icon(dashboardHeader(page), "pencil").click();
    await icon(dashboardHeader(page), "filter").click();

    await icon(popover(page), "calendar").click(); // "Time" -> "All Options"

    await getDashboardCard(page).getByText("[zz] Select…", { exact: true }).click();
    // 'Created At' is a column name, so it's not translated
    await popover(page).getByText("Created At", { exact: true }).first().click();
    await saveDashboard(page);

    await page
      .getByTestId("dashboard-parameters-and-cards")
      .getByText("[zz] Date", { exact: true })
      .click();
    await popover(page).getByText("[zz] Exclude…", { exact: true }).click();
    await popover(page)
      .getByText("[zz] Months of the year…", { exact: true })
      .click();
    // Dayjs doesn't have en-ZZ locale, falls back to en
    await popover(page).getByText("January", { exact: true }).click();
    await popover(page).getByText("[zz] Add filter", { exact: true }).click();

    await expect
      .poll(() => page.url())
      .toMatch(/\/dashboard\/\d+\?.*date=exclude-months-Jan/);
  });
});
