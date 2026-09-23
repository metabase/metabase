/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-required-field-filter.cy.spec.js
 *
 * A SQL question with a REQUIRED dimension (field) filter template-tag on
 * PRODUCTS.CATEGORY (own default ["Gizmo","Gadget"]) connected to a dashboard
 * "category" filter whose default is "Widget". Verifies default precedence
 * (dashboard filter default wins on load → "Widget"), that clearing the
 * dashboard filter falls back to the SQL field filter's default ("Gizmo"), that
 * the cleared state survives a reload (metabase#13960), and that the dashboard
 * default re-applies when the dashboard is re-opened from the collection root.
 *
 * Porting notes:
 * - The create-question / create-dashboard / map-filter setup lives in
 *   support/dashboard-filters-sql-required-field-filter.ts
 *   (setupRequiredFieldFilterDashboard) — the Cypress `it` did it inline via
 *   H.createNativeQuestionAndDashboard + H.editDashboardCard.
 * - `cy.location("search").should("eq", ...)` was retried by Cypress → ported
 *   as expect.poll over `new URL(page.url()).search` (PORTING: one-shot URL
 *   checks catch transient states).
 * - `cy.findByTestId("dashcard").contains(text)` / `H.filterWidget().contains(
 *   text)` are Cypress first-match presence checks → toContainText on the
 *   single dashcard / first parameter widget.
 * - The final "visit from root" click ports the unscoped findByText (exact) as
 *   a getByText({ exact: true }).
 */
import { filterWidget } from "../support/dashboard";
import { clearFilterWidget } from "../support/dashboard-parameters";
import { setupRequiredFieldFilterDashboard } from "../support/dashboard-filters-sql-required-field-filter";
import { test, expect } from "../support/fixtures";
import { visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > SQL > field filter > required", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should respect default filter precedence (dashboard filter, then SQL field filters)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await setupRequiredFieldFilterDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    // Default dashboard filter
    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?category=Widget");

    const dashcard = page.getByTestId("dashcard");
    await expect(dashcard).toContainText("Widget");

    await expect(filterWidget(page).first()).toContainText("Widget");

    await clearFilterWidget(page);

    await expect.poll(() => new URL(page.url()).search).toBe("?category=");

    // The default shouldn't apply, so we should get an error
    await expect(dashcard).toContainText("Gizmo");

    // The empty filter widget
    await expect(filterWidget(page).first()).toContainText("Category");

    await page.reload();

    // This part confirms that the issue metabase#13960 has been fixed
    await expect.poll(() => new URL(page.url()).search).toBe("?category=");
    await expect(dashcard).toContainText("Gizmo");

    // Let's make sure the default dashboard filter is respected upon a
    // subsequent visit from the root
    await page.goto("/collection/root");
    await page
      .getByText("Required Filters Dashboard", { exact: true })
      .click();

    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?category=Widget");
  });
});
