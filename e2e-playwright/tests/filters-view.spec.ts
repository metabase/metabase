/**
 * Playwright port of e2e/test/scenarios/filters/view.cy.spec.js
 *
 * Field filters in the QB "view": open a saved native question with dimension
 * template-tag filters (VENDOR search widget, CATEGORY value widget), applied
 * as a user with view-data but no create-queries permission.
 *
 * Notes on the port:
 * - The describe's beforeEach grants All Users "View" collection access on the
 *   root collection via the admin permissions UI (grantRootCollectionViewAccess).
 * - `H.visitQuestion("@questionId")` / `H.visitDashboard("@dashboardId")` become
 *   the shared visit helpers keyed on the created ids.
 * - `cy.findByText(str)` → exact getByText (rule 1); `cy.findAllByText(x).first()`
 *   → getByText(exact).first().
 */
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { createDashboard, createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  applyCategoryWidgetFilter,
  applyVendorSearchFilter,
  expectWrittenInSql,
  grantRootCollectionViewAccess,
} from "../support/filters-view";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard, visitQuestion } from "../support/ui";

const { PRODUCTS } = SAMPLE_DATABASE;

test.describe("scenarios > question > view", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("apply filters without data permissions", () => {
    let questionId: number;
    let dashboardId: number;

    test.beforeEach(async ({ page, mb }) => {
      // All users upgraded to collection view access
      await grantRootCollectionViewAccess(page);

      // Native query saved in dashboard
      const dashboard = await createDashboard(mb.api, {});
      dashboardId = dashboard.id;

      const question = await createNativeQuestion(mb.api, {
        name: "Question",
        native: {
          query: "select * from products where {{category}} and {{vendor}}",
          "template-tags": {
            category: {
              id: "6b8b10ef-0104-1047-1e5v-2492d5954555",
              name: "category",
              "display-name": "CATEGORY",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "string/=",
            },
            vendor: {
              id: "6b8b10ef-0104-1047-1e5v-2492d5964545",
              name: "vendor",
              "display-name": "VENDOR",
              type: "dimension",
              dimension: ["field", PRODUCTS.VENDOR, null],
              "widget-type": "string/=",
            },
          },
        },
      });
      questionId = question.id;

      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboardId,
        card_id: questionId,
      });
    });

    test("should show filters by search for Vendor", async ({ page }) => {
      await visitQuestion(page, questionId);

      await page.getByText("VENDOR", { exact: true }).first().click();
      const pop = popover(page);
      await expect(
        pop.getByPlaceholder("Search the list", { exact: true }),
      ).toBeVisible();
      await expect(
        pop.getByText("Search the list", { exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to filter Q by Category as no data user (from Q link) (metabase#12654)", async ({
      page,
      mb,
    }) => {
      await mb.signIn("nodata");
      await visitQuestion(page, questionId);

      // The nodata user has view-data permission (via All Users group) but no
      // create-queries permission. With param_fields hydration, field filter
      // widgets now show as dropdowns with values.
      await expectWrittenInSql(page);
      await applyVendorSearchFilter(page, "Balistreri-Muller");
      await applyCategoryWidgetFilter(page, "Widget");

      await page.getByTestId("run-button").last().click();

      await expect(page.getByText("Widget", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Gizmo", { exact: true })).toHaveCount(0);
    });

    test("should be able to filter Q by Vendor as user (from Dashboard) (metabase#12654)", async ({
      page,
      mb,
    }) => {
      // Navigate to Q from Dashboard
      await mb.signIn("nodata");
      await visitDashboard(page, mb.api, dashboardId);

      await page.getByText("Question", { exact: true }).click();

      // The nodata user has view-data permission (via All Users group) but no
      // create-queries permission. The dashboard load populates field metadata
      // into the entity cache via addFields, so field filter widgets show as
      // dropdowns when navigating to the question.
      await expectWrittenInSql(page);
      await applyVendorSearchFilter(page, "Balistreri-Muller");
      await applyCategoryWidgetFilter(page, "Widget");

      await page.getByTestId("run-button").last().click();

      await expect(
        page.locator(".test-TableInteractive-cellWrapper--firstColumn"),
      ).toHaveCount(1);
      const cardVisualization = page.locator(".CardVisualization");
      await expect(
        cardVisualization.getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(
        cardVisualization.getByText("Balistreri-Muller", { exact: true }),
      ).toBeVisible();
      await expect(
        cardVisualization.getByText("Gizmo", { exact: true }),
      ).toHaveCount(0);
      await expect(
        cardVisualization.getByText("McClure-Lockman", { exact: true }),
      ).toHaveCount(0);
    });
  });
});
