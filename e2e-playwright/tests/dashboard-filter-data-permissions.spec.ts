/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filter-data-permissions.cy.spec.js
 *
 * metabase#8472: a dashboard text filter mapped to a data column must offer its
 * value suggestions to any user who can view the dashboard — including a nodata
 * user with no direct data access. Both tests set up the filter as admin, then
 * open it (admin / nodata) and confirm the value dropdown suggests and applies.
 *
 * Notes on the port:
 * - The Cypress beforeEach ended with `cy.contains("Save").click()` followed by
 *   `cy.contains("Orders in a dashboard").click()` — the title click was a
 *   settle hack. saveDashboard() replaces both: it clicks Save, awaits the
 *   dashboard PUT, and waits for edit mode to exit and the dashcards to reload.
 * - The Cypress intercept for the params search aliased "search" was never
 *   registered (a typo folded `.as("search")` into the URL). It was only used
 *   by filterDashboard's dead `suggests: false` branch — see the helper.
 */
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { filterDashboard } from "../support/dashboard-filter-data-permissions";
import { test } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

test.describe("support > permissions (metabase#8472)", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Setup a dashboard with a text filter.
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);

    await setFilter(page, "Text or Category", "Is");

    // Filter the first card by User Address.
    await selectDashboardFilter(getDashboardCard(page, 0), "Address");

    await sidebar(page).getByRole("button", { name: "Done" }).click();
    await saveDashboard(page);
  });

  test("should allow an admin user to select the filter", async ({
    page,
    mb,
  }) => {
    await filterDashboard(page, mb.api);
  });

  test("should allow a nodata user to select the filter", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nodata");
    await filterDashboard(page, mb.api);
  });
});
