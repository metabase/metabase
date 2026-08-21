/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-management.cy.spec.js
 *
 * Managing a SQL-template-tag-backed dashboard filter: add a Number/= filter,
 * connect it to the native question's `tax` template-tag, apply a value, then
 * change the filter's operator and verify the mapping resets — a non-`=`
 * operator has no compatible target for a variable template-tag, so the mapping
 * UI disappears; switching back to `=` leaves the tag disconnected.
 *
 * Porting notes:
 * - beforeEach create-and-visit lives in
 *   support/dashboard-filters-sql-management.ts (setupSqlManagementDashboard).
 * - The SQL variable template-tag renders an INLINE number widget in view mode
 *   (like sql-number), so `H.filterWidget().type("10{enter}")` ports to
 *   click + type + Enter on the widget's textbox.
 * - `should("not.contain", ...)` → `expect(...).not.toContainText(...)`.
 * - `H.filterWidget().should("not.exist")` → `toHaveCount(0)`.
 */
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { setupSqlManagementDashboard } from "../support/dashboard-filters-sql-management";
import { test, expect } from "../support/fixtures";
import { popover, visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > SQL > management", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("number filter", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setupSqlManagementDashboard(mb.api);
      await visitDashboard(page, mb.api, dashboardId);
      await editDashboard(page);
    });

    test("should reset mappings when current operator is '=' and new operator is not '='", async ({
      page,
    }) => {
      await setFilter(page, "Number", "Equal to");

      await getDashboardCard(page).getByRole("button").click();
      await popover(page).getByText("Tax GTE", { exact: true }).click();

      await saveDashboard(page);

      const widget = filterWidget(page).first().getByRole("textbox");
      await widget.click();
      await widget.pressSequentially("10");
      await widget.press("Enter");

      await expect(getDashboardCard(page)).toContainText("1,062");

      await editDashboard(page);

      await page
        .getByTestId("edit-dashboard-parameters-widget-container")
        .getByText("Number")
        .click();

      await sidebar(page).locator(":text('Filter operator') + *").click();
      await popover(page).getByText("Between", { exact: true }).click();

      await expect(getDashboardCard(page)).not.toContainText(
        "Column to filter on",
      );

      await sidebar(page).locator(":text('Filter operator') + *").click();
      await popover(page).getByText("Equal to", { exact: true }).click();

      await expect(getDashboardCard(page)).not.toContainText("Tax GTE");

      await saveDashboard(page);

      await expect(filterWidget(page)).toHaveCount(0);
    });
  });
});
