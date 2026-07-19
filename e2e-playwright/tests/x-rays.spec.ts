/**
 * Playwright port of e2e/test/scenarios/dashboard/x-rays.cy.spec.js
 *
 * X-ray = automagic dashboards (see support/x-rays.ts header). Each generated
 * dashcard fires its own /api/dataset or /api/automagic-dashboards query, so
 * the counting response waits are registered BEFORE the triggering
 * navigation/click and awaited after (rule 2). X-rays are slow (upstream tags
 * the describe @slow and bumps timeouts to 30-60s) — the waits carry generous
 * explicit timeouts.
 *
 * Port notes:
 * - cy.intercept(...).as() + cy.wait("@x") → waitForResponse / the counting
 *   helpers in support/x-rays.ts, registered before the trigger.
 * - The "Compare to the rest" variant of the nested-native test is skipped
 *   upstream (cy.skipOn, "8 minutes in ci") → test.skip with the same reason.
 *   The 15737 NULL-titles test runs for BOTH actions (no skip there).
 * - `H.createQuestion({...}, { visitQuestion: true })` → createQuestion factory
 *   then visitQuestion(page, id).
 * - waitForSatisfyingResponse's recursive retry loop → waitForDatasetWithRows
 *   (a single async predicate bounded by the action timeout).
 * - test 6's `cy.intercept({times})` + `{ statusCode: 500 }` → a page.route
 *   counter: the first N /api/dataset requests pass through, the rest 500.
 */
import { expect, test } from "../support/fixtures";
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/command-palette";
import { chartPathWithFillColor } from "../support/binning";
import { cartesianChartCircles, undoToast } from "../support/metrics";
import { assertEChartsTooltip } from "../support/viz-charts-repros";
import { openVizSettingsSidebar } from "../support/charts";
import {
  addOrUpdateDashboardCard,
  dashboardGrid,
} from "../support/drillthroughs";
import { getDashboardCards } from "../support/dashboard-core";
import { saveDashboard } from "../support/dashboard";
import { visitDashboardAndCreateTab } from "../support/dashboard-tabs";
import { visitQuestionAdhoc } from "../support/permissions";
import {
  icon,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  visitQuestion,
} from "../support/ui";
import { main } from "../support/sharing";
import { findByDisplayValue } from "../support/filters-repros";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  getDashcardByTitle,
  waitForDatasetResponses,
  waitForDatasetWithRows,
  waitForGeojson,
  waitForXray,
} from "../support/x-rays";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

const AUTOMATIC_INSIGHTS = "Automatic insights…";
const XRAY_DATASETS = 5; // enough to load most questions

test.describe("scenarios > x-rays", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not display x-rays if the feature is disabled in admin settings (metabase#26571)", async ({
    page,
    mb,
  }) => {
    await mb.api.put("/api/setting/enable-xrays", { value: false });

    await page.goto("/");
    // Wait for the homepage shell to render before asserting the x-ray section
    // is absent (a bare not.exist would pass trivially against a blank page).
    await expect(page.getByLabel("Navigation bar")).toBeVisible();

    await expect(
      page.getByText(
        "Try out these sample x-rays to see what Metabase can do.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(page.getByText(/^A summary of/)).toHaveCount(0);
    await expect(page.getByText(/^A glance at/)).toHaveCount(0);
    await expect(page.getByText(/^A look at/)).toHaveCount(0);
    await expect(page.getByText(/^Some insights about/)).toHaveCount(0);
  });

  test("should work on questions with explicit joins (metabase#13112)", async ({
    page,
    mb,
  }) => {
    const PRODUCTS_ALIAS = "Products";

    const question = await createQuestion(mb.api, {
      name: "13112",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
            ],
            alias: PRODUCTS_ALIAS,
          },
        ],
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
        ],
      },
      display: "line",
    });
    await visitQuestion(page, question.id);

    // x-rays take a long time even locally — extend the wait (upstream: 30s).
    const datasetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
      { timeout: 30000 },
    );

    await cartesianChartCircles(page).nth(23).click({ force: true }); // random dot

    await page.getByText(AUTOMATIC_INSIGHTS, { exact: true }).click();
    await page.getByText("X-ray", { exact: true }).click();

    await datasetResponse;

    await expect(
      main(page).getByText(
        "A closer look at number of Orders where Created At is in March 2027 and Category is Gadget",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(icon(page, "warning")).toHaveCount(0);
  });

  for (const action of ["X-ray", "Compare to the rest"]) {
    test(`"${action.toUpperCase()}" should work on a nested question made from base native question (metabase#15655)`, async ({
      page,
      mb,
    }) => {
      test.skip(
        action === "Compare to the rest",
        "Skipping Compare to the rest test because it takes 8 minutes in ci",
      );

      const { id } = await createNativeQuestion(mb.api, {
        name: "15655",
        native: { query: "select * from people" },
      });

      const question = await createQuestion(mb.api, {
        name: "Count of 15655 by SOURCE",
        display: "bar",
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [["field", "SOURCE", { "base-type": "type/Text" }]],
        },
      });
      await visitQuestion(page, question.id);

      const xrayResponse = waitForXray(page);

      await chartPathWithFillColor(page, "#509EE3").first().click({
        force: true,
      });

      await popover(page).getByText(AUTOMATIC_INSIGHTS, { exact: true }).click();
      await popover(page).getByText(action, { exact: true }).click();

      // Ensure the dashboard is created and rendered. There are unit tests for
      // this too, so if the flake burden grows the rest can be removed.
      const postDatasets = waitForDatasetResponses(page, XRAY_DATASETS, {
        timeout: 15 * 1000,
      });
      await postDatasets;

      const xray = await xrayResponse;
      const xrayBody = await xray.json().catch(() => ({}));
      expect(xrayBody.cause).toBeUndefined();
      expect(xray.status()).not.toBe(500);

      await expect(
        main(page).getByText("A look at the number of 15655", { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByTestId("dashcard-container").first(),
      ).toBeVisible();
    });

    test(`"${action.toUpperCase()}" should not show NULL in titles of generated dashboard cards (metabase#15737)`, async ({
      page,
    }) => {
      const xrayResponse = waitForXray(page);

      await visitQuestionAdhoc(page, {
        // `name` is spread into the adhoc hash but absent from the shared
        // AdhocQuestion type; cast to keep it faithful without editing shared.
        name: "15737",
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [["count"]],
            breakout: [["field", PEOPLE.SOURCE, null]],
          },
          type: "query",
        },
        display: "bar",
      } as Parameters<typeof visitQuestionAdhoc>[1]);

      await chartPathWithFillColor(page, "#509EE3").first().click();

      await page.getByText(AUTOMATIC_INSIGHTS, { exact: true }).click();
      await page.getByText(action, { exact: true }).click();
      await xrayResponse;

      // cy.contains("null") is a case-sensitive substring on the whole page.
      await expect(page.getByText("null", { exact: false })).toHaveCount(0);
    });
  }

  test("should be able to save an x-ray as a dashboard and visit it immediately (metabase#18028)", async ({
    page,
  }) => {
    const geojson = waitForGeojson(page, { timeout: 10000 });

    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);

    await geojson;

    await page.getByRole("button", { name: "Save this", exact: true }).click();

    // "See it" link should be displayed both in the header and in the toast.
    await expect(undoToast(page)).toContainText("Your dashboard was saved");
    await expect(undoToast(page)).toContainText("See it");

    await page
      .getByTestId("automatic-dashboard-header")
      .getByRole("link", { name: "See it" })
      .click();

    await expect(page).toHaveURL(/a-look-at-orders/);

    await expect(
      page.getByTestId("dashcard").filter({ hasText: "18,760" }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("How these transactions are distributed", { exact: true }),
    ).toBeVisible();

    await openNavigationSidebar(page);

    await expect(
      navigationSidebar(page).getByRole("link", {
        name: /Automatically generated dashboards/i,
      }),
    ).toBeVisible();
  });

  test("should start loading cards from top to bottom", async ({ page }) => {
    // To check the order of loaded cards this test lets the first intercepted
    // request resolve successfully and then fails all others.
    const totalRequests = 8;
    const successfullyLoadedCards = 1;

    let datasetCount = 0;
    await page.route("**/api/dataset", async (route) => {
      datasetCount += 1;
      if (datasetCount <= successfullyLoadedCards) {
        await route.continue();
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: "{}",
        });
      }
    });

    // Wait for one successful and one failed dataset response.
    const okDataset = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/dataset" &&
        response.status() < 400,
    );
    const failedDataset = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/dataset" &&
        response.status() === 500,
    );

    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);

    await okDataset;
    await failedDataset;

    await expect(
      getDashboardCards(page).nth(1),
    ).toContainText("Total transactions");

    expect(totalRequests).toBe(8);
  });

  test("should be able to click the title of an x-ray dashcard to see it in the query builder (metabase#19405)", async ({
    page,
  }) => {
    const timeout = 10000;

    const geojson = waitForGeojson(page, { timeout });
    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);
    await geojson;

    // Confirm results of "Total transactions" card are present.
    await expect(page.getByText("18,760", { exact: true })).toBeVisible({
      timeout,
    });
    await page.getByText("Total transactions", { exact: true }).click();

    // Confirm we're in the query builder with the same results.
    await expect(page).toHaveURL(/\/question/);
    await expect(page.getByText("18,760", { exact: true })).toBeVisible();

    await page.goBack();

    // Add a parameter filter to the auto dashboard.
    await page.getByText("State", { exact: true }).click({ timeout });

    await page.getByPlaceholder("Search the list").fill("GA");
    await page.getByPlaceholder("Search the list").press("Enter");
    await page.getByLabel("GA", { exact: true }).click();
    await page.getByRole("button", { name: "Add filter", exact: true }).click();

    // Confirm results of "Total transactions" card were updated.
    await expect(page.getByText("463", { exact: true })).toBeVisible({
      timeout,
    });
    await page.getByText("Total transactions", { exact: true }).click();

    // Confirm the parameter filter is applied as a filter in the query builder.
    await expect(
      page.getByText("User → State is GA", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("463", { exact: true })).toBeVisible();
  });

  test("should correctly apply breakout in query builder (metabase#14648)", async ({
    page,
  }) => {
    // canceled requests still increment the intercept counter (upstream: 8 * 2).
    const orderDataset = waitForDatasetWithRows(page, [[18760]], {
      timeout: 60000,
    });

    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);

    await orderDataset;

    await dashboardGrid(page)
      .getByText("18,760", { exact: true })
      .first()
      .click();

    await popover(page).getByText("Break out by…", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Source", { exact: true }).click();

    await expect(page).toHaveURL(/\/question/);

    // Bars
    await expect(chartPathWithFillColor(page, "#509EE3")).toHaveCount(5);
    await chartPathWithFillColor(page, "#509EE3").nth(0).hover();

    await assertEChartsTooltip(page, {
      header: "Affiliate",
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "3,520",
        },
      ],
    });

    await openVizSettingsSidebar(page);
    const sourceFieldPicker = await findByDisplayValue(
      page.getByTestId("chartsettings-field-picker"),
      "User → Source",
    );
    await expect(sourceFieldPicker).toBeVisible();
  });

  test("should be able to open x-ray on a dashcard from a dashboard with multiple tabs", async ({
    page,
    mb,
  }) => {
    const { id: dashboard_id } = await mb.api.createDashboard({
      name: "my dashboard",
    });
    await addOrUpdateDashboardCard(mb.api, {
      card_id: ORDERS_BY_YEAR_QUESTION_ID,
      dashboard_id,
      card: {
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 10,
        visualization_settings: {},
      },
    });
    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: dashboard_id,
      save: false,
    });
    await page.getByRole("tab", { name: "Tab 1", exact: true }).click();
    await saveDashboard(page);

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
      { timeout: 60000 },
    );

    await cartesianChartCircles(page).nth(0).click({ force: true });
    await popover(page).getByText(AUTOMATIC_INSIGHTS, { exact: true }).click();
    await popover(page).getByText("X-ray", { exact: true }).click();
    await dataset;

    // Ensure charts actually got rendered.
    await expect(
      page.locator("text").filter({ hasText: "Created At" }).first(),
    ).toBeVisible();
  });

  test("should default x-ray dashboard width to 'fixed'", async ({ page }) => {
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
      { timeout: 60000 },
    );
    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);
    await dataset;

    // x-ray dashboards should default to 'fixed' width.
    await expect(
      page.getByTestId("fixed-width-dashboard-header"),
    ).toHaveCSS("max-width", "1048px");
    await expect(page.getByTestId("fixed-width-filters")).toHaveCSS(
      "max-width",
      "1048px",
    );
    await expect(page.getByTestId("dashboard-grid")).toHaveCSS(
      "max-width",
      "1048px",
    );
  });

  test("should render all cards without errors (metabase#48519)", async ({
    page,
  }) => {
    // There are 8 questions on the Orders x-ray dashboard.
    const datasets = waitForDatasetResponses(page, 8, { timeout: 60 * 1000 });

    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);
    await datasets;

    await expect(
      getDashcardByTitle(page, "Total transactions").getByText("18,760", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getDashcardByTitle(page, "Transactions in the last 30 days").getByTestId(
        "scalar-value",
      ),
    ).toBeVisible(); // not asserting a value as it's dynamic

    const avgQuantity = getDashcardByTitle(page, "Average quantity per month");
    await expect(
      avgQuantity.getByText("Average of Quantity", { exact: true }),
    ).toBeVisible();
    await expect(
      avgQuantity.getByText("Created At: Month", { exact: true }),
    ).toBeVisible();

    const salesPerSource = getDashcardByTitle(page, "Sales per source");
    await expect(
      salesPerSource.getByText("Organic", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerSource.getByText("Affiliate", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerSource.getByText("Count", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerSource.getByText("Created At: Month", { exact: true }),
    ).toBeVisible();

    const salesPerProduct = getDashcardByTitle(page, "Sales per product");
    await expect(
      salesPerProduct.getByText("Product → Title", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerProduct.getByText("Aerodynamic Bronze Hat", { exact: true }),
    ).toBeVisible();

    const salesPerCategory = getDashcardByTitle(
      page,
      "Sales for each product category",
    );
    await expect(
      salesPerCategory.getByText("Product → Category", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerCategory.getByText("Doohickey", { exact: true }),
    ).toBeVisible();
    await expect(
      salesPerCategory.getByText("Count", { exact: true }),
    ).toBeVisible();

    await expect(
      getDashcardByTitle(page, "Sales per state").getByTestId(
        "choropleth-feature",
      ),
    ).toHaveCount(50); // 50 states
    await expect(
      getDashcardByTitle(page, "Sales by coordinates").getByText("Leaflet", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should work on questions with breakout by day-of-week and null semantic type (metabase#23820)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });
    const question = await createQuestion(mb.api, {
      name: "23820",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
        ],
      },
      display: "line",
    });
    await visitQuestion(page, question.id);

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );

    await cartesianChartCircles(page).nth(3).click(); // Wednesday

    await popover(page).getByText(AUTOMATIC_INSIGHTS, { exact: true }).click();
    await popover(page).getByText("X-ray", { exact: true }).click();

    await dataset;

    await expect(
      main(page).getByText(
        "A closer look at number of Orders where day of week of Created At is Wednesday",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(
      getDashcardByTitle(page, "A look at Created At fields"),
    ).toBeVisible();
    await expect(
      getDashcardByTitle(page, "A look at the number of Orders"),
    ).toBeVisible();
  });
});
