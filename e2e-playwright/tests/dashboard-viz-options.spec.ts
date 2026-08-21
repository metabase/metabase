/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/visualization-options.cy.spec.js
 */
import {
  editDashboard,
  getDashboardCard,
  modal,
  saveDashboard,
} from "../support/dashboard";
import {
  getDashboardCardMenu,
  icon,
  inputWithValue,
  moveDnDKitElementOnto,
  showDashboardCardActions,
} from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard cards > visualization options", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow empty card title (metabase#12013, metabase#36788)", async ({
    page,
    mb,
  }) => {
    const originalCardTitle = "Orders";
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await expect(page.getByTestId("legend-caption")).toContainText(
      originalCardTitle,
    );

    await editDashboard(page);
    await showDashboardCardActions(page);
    await icon(page, "palette").click();

    const dialog = modal(page);
    const titleInput = await inputWithValue(dialog, originalCardTitle);
    await titleInput.click();
    await titleInput.fill("");
    await titleInput.blur();
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(page.getByTestId("legend-caption")).not.toContainText(
      originalCardTitle,
    );
    await saveDashboard(page);
    await getDashboardCard(page).hover();
    await (await getDashboardCardMenu(page)).click();
    await expect(popover(page)).toContainText("Edit question");
    await expect(popover(page)).toContainText("Download results");
  });

  test("should show the ellipsis even with an empty card title on visualizations with noHeader (metabase#46897)", async ({
    page,
    mb,
  }) => {
    const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

    const QUESTION_TABLE = {
      name: "The tablest of all tables",
      display: "table",
      query: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const { dashboardId } = await mb.api.createQuestionAndDashboard({
      questionDetails: QUESTION_TABLE,
    });
    await visitDashboard(page, mb.api, dashboardId);

    await expect(page.getByTestId("legend-caption")).toContainText(
      QUESTION_TABLE.name,
    );

    await editDashboard(page);
    await showDashboardCardActions(page);
    await icon(page, "palette").click();

    const dialog = modal(page);
    const titleInput = await inputWithValue(dialog, QUESTION_TABLE.name);
    await titleInput.click();
    await titleInput.fill("");
    await titleInput.blur();
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(page.getByTestId("legend-caption")).not.toContainText(
      QUESTION_TABLE.name,
    );
    await saveDashboard(page);
    await getDashboardCard(page).hover();
    await (await getDashboardCardMenu(page)).click();
    await expect(popover(page)).toContainText("Edit question");
    await expect(popover(page)).toContainText("Download results");
  });

  test("column reordering should work (metabase#16229)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await page.getByLabel("Edit dashboard").click();
    await getDashboardCard(page).hover();
    await page.getByLabel("Show visualization options").click();

    const sidebar = page.getByTestId("chartsettings-sidebar");
    await moveDnDKitElementOnto(
      sidebar.getByTestId("draggable-item-ID"),
      sidebar.getByTestId("draggable-item-User ID"),
    );

    // The ID column should be directly below the User ID column.
    await expect
      .poll(async () => {
        const names = await sidebar
          .locator('[data-testid^="draggable-item-"]')
          .evaluateAll((elements) =>
            elements.map((el) => el.getAttribute("data-testid")),
          );
        return (
          names.indexOf("draggable-item-ID") -
          names.indexOf("draggable-item-User ID")
        );
      })
      .toBe(1);

    // The table preview should update immediately, reflecting the new order.
    await expect(
      modal(page).getByRole("columnheader").first(),
    ).toContainText("User ID");
  });

  test("should reflect column settings accurately when changing (metabase#30966)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await page.getByLabel("Edit dashboard").click();
    await getDashboardCard(page).hover();
    await page.getByLabel("Show visualization options").click();
    await page.getByTestId("Subtotal-settings-button").click();
    await popover(page)
      .getByLabel("Show a mini bar chart")
      .click({ force: true });
    await expect(
      page.getByTestId("mini-bar-container").first(),
    ).toBeVisible();
  });
});
