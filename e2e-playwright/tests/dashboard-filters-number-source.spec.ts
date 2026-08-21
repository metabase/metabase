/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-number-source.cy.spec.js
 *
 * The Cypress original registers cy.intercept("POST", "/api/dataset").as("dataset")
 * in beforeEach but never waits on it in this spec — dropped here. Response
 * waits live where they're needed (saveDashboard, visitDashboard).
 */
import type { Page } from "@playwright/test";

import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  setFilterListSource,
  setFilterQuestionSource,
  sidebar,
} from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

test.describe("scenarios > dashboard > filters", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("static list source (dropdown)", () => {
    test("should be able to use a static list source", async ({ page, mb }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Number", "Equal to", "Number");
      await mapFilterToQuestion(page);
      await setFilterListSource(page, {
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      await saveDashboard(page);

      await filterDashboard(page, { isDropdown: true });
      await expect(filterWidget(page).getByText("Twenty", { exact: true })).toBeVisible();
      await expect(getDashboardCard(page).getByText("4", { exact: true })).toBeVisible();
    });
  });

  test.describe("static list source (search)", () => {
    test("should be able to use a static list source (search)", async ({
      page,
      mb,
    }) => {
      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await editDashboard(page);
      await setFilter(page, "Number", "Equal to", "Number");
      await mapFilterToQuestion(page);
      await sidebar(page).getByText("Search box", { exact: true }).click();
      await setFilterListSource(page, {
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      await saveDashboard(page);

      await filterDashboard(page, { isLabeled: true });
      await expect(filterWidget(page).getByText("Twenty", { exact: true })).toBeVisible();
    });
  });

  test.describe("card source (dropdown)", () => {
    test("should allow to use a card source with numeric columns and a single value", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await editDashboard(page);
      await setFilter(page, "Number", "Less than or equal to");
      await selectDashboardFilter(getDashboardCard(page), "Total");
      await sidebar(page).getByText("Dropdown list", { exact: true }).click();
      await setFilterQuestionSource(page, { question: "Orders", field: "ID" });
      await saveDashboard(page);

      // pick a value without searching
      await filterWidget(page).click();
      await popover(page).getByText("5", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await expect(getDashboardCard(page).getByText("1 row", { exact: true })).toBeVisible();

      // pick a value with searching
      await filterWidget(page).click();
      await popover(page).getByPlaceholder("Search the list").fill("225");
      await expect(
        popover(page).getByLabel("5", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("225", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();
      await expect(
        getDashboardCard(page).getByText("Showing first 2,000 rows"),
      ).toBeVisible();
    });

    test("should allow to use a card source with numeric columns and multiple values", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await editDashboard(page);
      await setFilter(page, "Number", "Equal to");
      await selectDashboardFilter(getDashboardCard(page), "Quantity");
      await sidebar(page).getByText("Dropdown list", { exact: true }).click();
      await setFilterQuestionSource(page, { question: "Orders", field: "ID" });
      await saveDashboard(page);

      // pick a value without searching
      await filterWidget(page).click();
      await popover(page).getByText("7", { exact: true }).click();
      await popover(page).getByText("25", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await expect(getDashboardCard(page).getByText("932 rows", { exact: true })).toBeVisible();

      // pick a value with searching
      await filterWidget(page).click();
      await expect(popover(page).getByLabel("7", { exact: true })).toBeChecked();
      await expect(
        popover(page).getByLabel("25", { exact: true }),
      ).toBeChecked();
      await popover(page).getByPlaceholder("Search the list").fill("225");
      await expect(
        popover(page).getByLabel("7", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("225", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter" })
        .click();

      await filterWidget(page).click();
      await expect(popover(page).getByLabel("7", { exact: true })).toBeChecked();
      await expect(
        popover(page).getByLabel("25", { exact: true }),
      ).toBeChecked();
      await expect(
        popover(page).getByLabel("225", { exact: true }),
      ).toBeChecked();
    });
  });
});

const mapFilterToQuestion = async (page: Page, column = "Quantity") => {
  await page.getByText("Select…").click();
  await popover(page).getByText(column, { exact: true }).click();
};

const filterDashboard = async (
  page: Page,
  {
    isLabeled = false,
    isDropdown = false,
  }: { isLabeled?: boolean; isDropdown?: boolean } = {},
) => {
  await filterWidget(page).click();

  if (isDropdown) {
    const dropdown = popover(page);
    await expect(dropdown.getByPlaceholder("Search the list")).toBeVisible();
    await expect(dropdown.getByText("Ten", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("30", { exact: true })).toBeVisible();
    await dropdown.getByText("Twenty", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter" }).click();
    return;
  }

  if (isLabeled) {
    // Two popovers coexist here: the filter widget and its typeahead.
    await popover(page)
      .first()
      .getByPlaceholder("Enter a number")
      .pressSequentially("T");
    await popover(page).last().getByText("Twenty", { exact: true }).click();
    await popover(page)
      .first()
      .getByRole("button", { name: "Add filter" })
      .click();
    return;
  }

  await popover(page).getByPlaceholder("Enter a number").fill("20");
  await popover(page).getByRole("button", { name: "Add filter" }).click();
};
