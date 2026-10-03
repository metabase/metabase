/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-id.cy.spec.js
 *
 * ID dashboard filter across a primary key, a foreign key and an implicit-join
 * column. For each the filter is set (via the widget, or as a default value),
 * the dashboard is saved, and the resulting single-row scalar dashcard is
 * verified.
 *
 * Notes on the port:
 * - The Cypress beforeEach registered ONE `@dashboardData` alias
 *   (the POST dashcard-query route) and each test called `cy.wait` on it
 *   several times, consuming responses in order. Playwright's waitForResponse
 *   only sees FUTURE responses, so instead of a single long-lived intercept we
 *   register `waitForDashcardQuery` immediately BEFORE each triggering action
 *   (save / apply) and await it after (PORTING rule 2). Same coverage, per-hop.
 * - `H.popover().contains("ID").first()` is a case-sensitive first-DOM-match.
 *   The mapping popover lists the own PK "ID" first, then the implicit-join
 *   columns; ported as exact getByText("ID").first() / .nth(1) to mirror the
 *   fixed ordering the upstream comment relies on.
 * - addWidgetStringFilter / clickDefaultValueToggle / waitForDashcardQuery are
 *   the shared ports of the same field-filter helpers the Cypress spec imports;
 *   checkFilterLabelAndValue is the existing shared port. All imported read-only.
 */
import {
  editDashboard,
  filterWidget,
  saveDashboard,
  setFilter,
} from "../support/dashboard";
import {
  addWidgetStringFilter,
  clickDefaultValueToggle,
  waitForDashcardQuery,
} from "../support/dashboard-filters-text-category";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import { checkFilterLabelAndValue } from "../support/title-drill";
import { popover, visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard > filters > ID", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await setFilter(page, "ID");

    await page.getByText("Select…", { exact: true }).click();
  });

  test.describe("should work for the primary key", () => {
    test.beforeEach(async ({ page }) => {
      await popover(page).getByText("ID", { exact: true }).first().click();
    });

    test("when set through the filter widget", async ({ page }) => {
      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;

      await filterWidget(page).click();
      const appliedQuery = waitForDashcardQuery(page);
      await addWidgetStringFilter(page, "15");
      await appliedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("114.42");
    });

    test("when set as the default filter", async ({ page }) => {
      await clickDefaultValueToggle(page);
      await addWidgetStringFilter(page, "15");

      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("114.42");
    });
  });

  test.describe("should work for the foreign key", () => {
    test.beforeEach(async ({ page }) => {
      await popover(page).getByText("User ID", { exact: true }).first().click();
    });

    test("when set through the filter widget", async ({ page }) => {
      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;

      await filterWidget(page).click();
      const appliedQuery = waitForDashcardQuery(page);
      await addWidgetStringFilter(page, "4");
      await appliedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("47.68");
      await checkFilterLabelAndValue(page, "ID", "Arnold Adams - 4");
    });

    test("when set as the default filter", async ({ page }) => {
      await clickDefaultValueToggle(page);
      await addWidgetStringFilter(page, "4");

      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("47.68");
      await checkFilterLabelAndValue(page, "ID", "Arnold Adams - 4");
    });
  });

  test.describe("should work on the implicit join", () => {
    test.beforeEach(async ({ page }) => {
      // There are three of these, and the order is fixed:
      // "own" column first, then implicit join on People and User alphabetically.
      // We select index 1 to get the Product.ID.
      await popover(page).getByText("ID", { exact: true }).nth(1).click();
    });

    test("when set through the filter widget", async ({ page }) => {
      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;

      await filterWidget(page).click();
      const appliedQuery = waitForDashcardQuery(page);
      await addWidgetStringFilter(page, "10");
      await appliedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("6.75");
    });

    test("when set as the default filter", async ({ page }) => {
      await clickDefaultValueToggle(page);
      await addWidgetStringFilter(page, "10");

      const savedQuery = waitForDashcardQuery(page);
      await saveDashboard(page);
      await savedQuery;
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(page.getByTestId("dashcard")).toContainText("6.75");
    });
  });
});
