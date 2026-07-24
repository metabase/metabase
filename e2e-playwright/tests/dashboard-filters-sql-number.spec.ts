/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-number.cy.spec.js
 *
 * A SQL-backed question with two number template-tags (price, rating) connected
 * to two dashboard number filters (number/=). The single test types values into
 * the two inline number widgets and verifies the filtered rows survive on blur
 * (metabase#31975).
 *
 * Porting notes:
 * - The beforeEach's create-and-connect flow lives in
 *   support/dashboard-filters-sql-number.ts (setupSqlNumberDashboard).
 * - The inline number widget DROPS its `placeholder` (= filter name) the moment
 *   it gains focus — it swaps to a "Price:" label sibling. So Cypress's
 *   `findByPlaceholderText("Price")` (which resolves once and reuses the element)
 *   can't be ported as a re-resolving getByPlaceholder — pressSequentially would
 *   fail to re-find it after the click. Scope to the parameter widget (Rating is
 *   first, Price second — the order of `filterDetails`) and target its textbox
 *   by role, which is stable regardless of focus.
 * - The Cypress test has no cy.wait; the final table-body assertion retries.
 *   Playwright's auto-retrying expect on the row count / cell text mirrors that.
 * - `findAllByRole("row").should("have.length", 2).and("contain", ...)` → assert
 *   the row count, then that the table-body contains each expected value.
 */
import { filterWidget } from "../support/dashboard";
import { setupSqlNumberDashboard } from "../support/dashboard-filters-sql-number";
import { test, expect } from "../support/fixtures";
import { visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > SQL > number", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboardId = await setupSqlNumberDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);
  });

  test("should keep filter value on blur (metabase#31975)", async ({ page }) => {
    // filterDetails order: Rating (0), Price (1).
    const price = filterWidget(page).nth(1).getByRole("textbox");
    await price.click();
    await price.pressSequentially("95");
    await price.blur();

    const rating = filterWidget(page).nth(0).getByRole("textbox");
    await rating.click();
    await rating.pressSequentially("3.8");
    await rating.blur();

    const tableBody = page.getByTestId("table-body");
    await expect(tableBody.getByRole("row")).toHaveCount(2);
    // first line price / rating
    await expect(tableBody).toContainText("98.82");
    await expect(tableBody).toContainText("4.3");
    // second line price / rating
    await expect(tableBody).toContainText("95.93");
    await expect(tableBody).toContainText("4.4");
  });
});
