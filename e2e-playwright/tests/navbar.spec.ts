/**
 * Playwright port of e2e/test/scenarios/navigation/navbar.cy.spec.js
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import {
  appBar,
  assertNavigationSidebarBookmarkSelected,
  assertNavigationSidebarItemSelected,
  collectionTable,
  navigationSidebar,
  newButton,
  openNavigationSidebar,
  popover,
  queryBuilderHeader,
  sidebarSection,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > navigation > navbar", () => {
  test.describe("Normal user", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsNormalUser();
    });

    test("should be open after logging in", async ({ page }) => {
      await page.goto("/");
      await expect(navigationSidebar(page)).toBeVisible();
    });

    test("should highlight relevant entities when navigating", async ({
      page,
      mb,
    }) => {
      const questionName = "Bookmarked question";
      const { id } = await mb.api.createQuestion({
        name: questionName,
        collection_id: THIRD_COLLECTION_ID,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      });
      await mb.api.bookmarkCard(id);
      await visitQuestion(page, id);

      await openNavigationSidebar(page);
      await assertNavigationSidebarItemSelected(page, /Third collection/);
      await assertNavigationSidebarBookmarkSelected(page, questionName);

      await newButton(page).click();
      await popover(page).getByText(/SQL query/).click();

      await openNavigationSidebar(page);
      await assertNavigationSidebarItemSelected(
        page,
        /Third collection/,
        "false",
      );
      await assertNavigationSidebarBookmarkSelected(
        page,
        questionName,
        "false",
      );
    });

    test("should display error ui when data fetching fails", async ({
      page,
    }) => {
      await page.route(
        (url) => url.pathname === "/api/database",
        (route) =>
          route.request().method() === "GET"
            ? route.fulfill({ status: 500 })
            : route.fallback(),
      );
      await page.goto("/");
      await expect(
        navigationSidebar(page).getByText(/An error occurred/),
      ).toBeVisible();
    });

    test("state should preserve when clicking the mb logo", async ({
      page,
      mb,
    }) => {
      await page.goto("/collection/root");
      await expect(navigationSidebar(page)).toBeVisible();
      await page.getByTestId("main-logo-link").click();
      await expect(navigationSidebar(page)).toBeVisible();

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(navigationSidebar(page)).toBeHidden();

      await page.getByTestId("main-logo-link").click();
      await expect(navigationSidebar(page)).toBeHidden();
    });

    test("should close when visiting a dashboard", async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(navigationSidebar(page)).toBeHidden();
    });

    test("should preserve state when visiting a collection", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(navigationSidebar(page)).toBeHidden();
      await appBar(page).getByText("Our analytics").click();
      await expect(navigationSidebar(page)).toBeHidden();
    });

    test("should close when creating a new question", async ({ page }) => {
      await page.goto("/");
      await expect(navigationSidebar(page)).toBeVisible();
      await appBar(page).getByText("New").click();
      await popover(page).getByText(/Question/).click();
      await expect(navigationSidebar(page)).toBeHidden();
    });

    test("should close when opening a sql editor", async ({ page }) => {
      await page.goto("/");
      await expect(navigationSidebar(page)).toBeVisible();
      await appBar(page).getByText("New").click();
      await popover(page).getByText(/SQL query/).click();
      await expect(navigationSidebar(page)).toBeHidden();
    });
  });

  test.describe("Custom Homepage", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.updateSetting("custom-homepage", true);
      await mb.api.updateSetting(
        "custom-homepage-dashboard",
        ORDERS_DASHBOARD_ID,
      );
    });

    test("should be open when visiting home with a custom home page configured", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/dashboard\//);
      await expect(navigationSidebar(page)).toBeVisible();

      await page.getByTestId("main-logo-link").click();
      await expect(navigationSidebar(page)).toBeVisible();
    });

    test("should preserve state when clicking the mb logo and custom home page is configured", async ({
      page,
      mb,
    }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await expect(navigationSidebar(page)).toBeHidden();
      await page.getByTestId("main-logo-link").click();
      await expect(navigationSidebar(page)).toBeHidden();
    });
  });

  test.describe("EE", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should be open when logging in with a landing page configured", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("landing-page", "/question/76");
      await page.goto("/");
      await expect(page).toHaveURL(/question/);
      await expect(navigationSidebar(page)).toBeVisible();
    });

    test("should preserve state when clicking the mb logo and landing page is configured", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("landing-page", "/question/76");
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await page.getByTestId("main-logo-link").click();
      await expect(navigationSidebar(page)).toBeHidden();
    });
  });

  test.describe("library", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should show the library when a table is published", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      await page.goto("/");
      await sidebarSection(page, "Library").getByText("Data").click();
      await collectionTable(page).getByText("Orders").click();
      await expect(queryBuilderHeader(page).getByText("Orders")).toBeVisible();
    });
  });
});
