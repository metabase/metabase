/**
 * Playwright port of
 * e2e/test/scenarios/question/native-query-drill.cy.spec.ts
 *
 * Drill-through from a NATIVE query's result table / chart. The available
 * drills differ from MBQL (no underlying-records / breakout), but the
 * column-header, cell, chart-point and brush drills all work.
 *
 * Notes:
 * - beforeEach registered `@dataset` (POST /api/dataset) and `@saveCard`
 *   (POST /api/card). Playwright waits are registered before the triggering
 *   action instead (waitForDataset / waitForSaveCard).
 * - H.createNativeQuestion(details, { visitQuestion, wrapId }) →
 *   createNativeQuestion(mb.api, details) + visitQuestion(page, id); the id is
 *   kept in a local (the "@questionId" alias).
 * - H.visitQuestionAdhoc(nativeQuestion) autoruns the native query
 *   (runNativeQuery under the hood) → visitNativeQuestionAdhoc.
 * - H.cartesianChartCircle().eq(0) → cartesianChartCircles(page).first().
 * - H.applyBrush / applyBoxFilter and the spec-local applyBrushFilter live in
 *   support/native-query-drill.ts.
 */
import { echartsContainer } from "../support/charts";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
} from "../support/factories";
import type { NativeQuestionDetails } from "../support/factories";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { getDashboardCard } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { cartesianChartCircles } from "../support/metrics";
import { tableInteractive, waitForDataset } from "../support/models";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  applyBoxFilter,
  applyBrushFilter,
} from "../support/native-query-drill";
import { assertQueryBuilderRowCount, tableHeaderClick } from "../support/notebook";
import { SAMPLE_DB_ID } from "../support/sample-data";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";

const ordersTableQuestionDetails: NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
};

const peopleTableQuestionDetails: NativeQuestionDetails = {
  display: "table",
  native: {
    query: "SELECT ID, EMAIL, CREATED_AT FROM PEOPLE ORDER BY ID LIMIT 10",
  },
};

const timeseriesLineQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT CREATED_AT, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["QUANTITY"],
  },
};

const timeseriesWithCategoryLineQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT PRICE, CATEGORY, CREATED_AT FROM PRODUCTS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["PRICE"],
  },
};

const numericLineQuestionDetails: NativeQuestionDetails = {
  display: "line",
  native: {
    query: "SELECT ID, QUANTITY FROM ORDERS ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "graph.dimensions": ["ID"],
    "graph.metrics": ["QUANTITY"],
  },
};

const pinMapQuestionDetails: NativeQuestionDetails = {
  display: "map",
  native: {
    query: "SELECT LATITUDE, LONGITUDE FROM PEOPLE ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "map.type": "pin",
    "map.longitude_column": "LONGITUDE",
    "map.latitude_column": "LATITUDE",
  },
};

const gridMapQuestionDetails: NativeQuestionDetails = {
  display: "map",
  native: {
    query: "SELECT LATITUDE, LONGITUDE FROM PEOPLE ORDER BY ID LIMIT 10",
  },
  visualization_settings: {
    "map.type": "grid",
    "map.longitude_column": "LONGITUDE",
    "map.latitude_column": "LATITUDE",
  },
};

function waitForSaveCard(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

test.describe("scenarios > question > native query drill", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("query builder metadata", () => {
    test("should allow to save an ad-hoc native query when attempting to drill", async ({
      page,
    }) => {
      await visitNativeQuestionAdhoc(page, {
        display: "table",
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: peopleTableQuestionDetails.native as { query: string },
        },
      });

      await tableInteractive(page)
        .getByText("October 7, 2026, 1:34 AM", { exact: true })
        .click();
      await expect(
        popover(page).getByText("Filter by this date and time", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByRole("button", { name: "Save", exact: true }).click();

      await modal(page).getByLabel("Name").fill("SQL");
      const saveCard = waitForSaveCard(page);
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();
      await saveCard;

      await tableInteractive(page)
        .getByText("October 7, 2026, 1:34 AM", { exact: true })
        .click();
      await expect(
        popover(page).getByText("Filter by this date and time", { exact: true }),
      ).toBeVisible();
      const dataset = waitForDataset(page);
      await popover(page).getByText("On", { exact: true }).click();
      await dataset;
      await assertQueryBuilderRowCount(page, 1);
    });
  });

  test.describe("query builder drills", () => {
    test("column-extract drill", async ({ page, mb }) => {
      // from column header
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "CREATED_AT");
      await popover(page).getByText("Extract day, month…", { exact: true }).click();
      let dataset = waitForDataset(page);
      // The extract-unit button wraps the label text node next to an example
      // span ("Q1, Q2"), so exact getByText (full element text) misses it —
      // mixed-content-text gotcha; case-sensitive substring instead.
      await popover(page).getByText(/Quarter of year/).click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2028, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2027, 8:04 AM", "3", "Q2"],
        ],
      });

      // from plus button
      await visitQuestion(page, id);
      await tableInteractive(page)
        .getByRole("button", { name: "Add column", exact: true })
        .click();
      await popover(page).getByText("Extract part of column", { exact: true }).click();
      await popover(page).getByText("CREATED_AT", { exact: true }).click();
      dataset = waitForDataset(page);
      // The extract-unit button wraps the label text node next to an example
      // span ("Q1, Q2"), so exact getByText (full element text) misses it —
      // mixed-content-text gotcha; case-sensitive substring instead.
      await popover(page).getByText(/Quarter of year/).click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "CREATED_AT", "QUANTITY", "Quarter of year"],
        firstRows: [
          ["1", "February 11, 2028, 9:40 PM", "2", "Q1"],
          ["2", "May 15, 2027, 8:04 AM", "3", "Q2"],
        ],
      });
    });

    test("combine-columns drill", async ({ page, mb }) => {
      // from column header
      const { id } = await createNativeQuestion(mb.api, peopleTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "EMAIL");
      await popover(page).getByText("Combine columns", { exact: true }).click();
      let dataset = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "EMAIL", "CREATED_AT", "Combined EMAIL, ID"],
        firstRows: [
          [
            "1",
            "borer-hudson@yahoo.com",
            "October 7, 2026, 1:34 AM",
            "borer-hudson@yahoo.com 1",
          ],
        ],
      });

      // from plus button
      await visitQuestion(page, id);
      await tableInteractive(page)
        .getByRole("button", { name: "Add column", exact: true })
        .click();
      await popover(page).getByText("Combine columns", { exact: true }).click();
      dataset = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "EMAIL", "CREATED_AT", "Combined ID, EMAIL"],
        firstRows: [
          [
            "1",
            "borer-hudson@yahoo.com",
            "October 7, 2026, 1:34 AM",
            "1 borer-hudson@yahoo.com",
          ],
        ],
      });
    });

    test("column-filter drill", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);
      await assertQueryBuilderRowCount(page, 10);

      await tableHeaderClick(page, "QUANTITY");
      await popover(page).getByText("Filter by this column", { exact: true }).click();
      await popover(page).getByPlaceholder("Min").fill("2");
      await popover(page).getByPlaceholder("Max").fill("5");
      const dataset = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();
      await dataset;
      await assertQueryBuilderRowCount(page, 8);
    });

    test("distribution drill", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "QUANTITY");
      const dataset = waitForDataset(page);
      await popover(page).getByText("Distribution", { exact: true }).click();
      await dataset;
      await expect(
        echartsContainer(page).getByText("Count", { exact: true }),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("QUANTITY: 8 bins", { exact: true }),
      ).toBeVisible();
      await assertQueryBuilderRowCount(page, 5);
    });

    test("quick-filter drill", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(
        mb.api,
        timeseriesLineQuestionDetails,
      );
      await visitQuestion(page, id);
      await assertQueryBuilderRowCount(page, 10);

      await cartesianChartCircles(page).first().click();
      await expect(
        popover(page).getByText("Filter by this value", { exact: true }),
      ).toBeVisible();
      const dataset = waitForDataset(page);
      await popover(page).getByText("=", { exact: true }).click();
      await dataset;
      await assertQueryBuilderRowCount(page, 3);
    });

    test("sort drill", async ({ page, mb }) => {
      // ascending
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "QUANTITY");
      let dataset = waitForDataset(page);
      await icon(popover(page), "arrow_up").click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["1", "February 11, 2028, 9:40 PM", "2"]],
      });

      // descending
      await visitQuestion(page, id);
      await tableHeaderClick(page, "QUANTITY");
      dataset = waitForDataset(page);
      await icon(popover(page), "arrow_down").click();
      await dataset;
      await assertTableData(page, {
        columns: ["ID", "CREATED_AT", "QUANTITY"],
        firstRows: [["8", "June 17, 2028, 2:37 AM", "7"]],
      });
    });

    test("summarize drill", async ({ page, mb }) => {
      // distinct values
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "QUANTITY");
      let dataset = waitForDataset(page);
      await popover(page).getByText("Distinct values", { exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["Distinct values of QUANTITY"],
        firstRows: [["5"]],
      });

      // sum
      await visitQuestion(page, id);
      await tableHeaderClick(page, "QUANTITY");
      dataset = waitForDataset(page);
      await popover(page).getByText("Sum", { exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["Sum of QUANTITY"],
        firstRows: [["38"]],
      });

      // avg
      await visitQuestion(page, id);
      await tableHeaderClick(page, "QUANTITY");
      dataset = waitForDataset(page);
      await popover(page).getByText("Avg", { exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["Average of QUANTITY"],
        firstRows: [["3.8"]],
      });
    });

    test("summarize-column-by-time drill", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(mb.api, ordersTableQuestionDetails);
      await visitQuestion(page, id);

      await tableHeaderClick(page, "QUANTITY");
      const dataset = waitForDataset(page);
      await popover(page).getByText("Sum over time", { exact: true }).click();
      await dataset;
      await assertTableData(page, {
        columns: ["CREATED_AT: Month", "Sum of QUANTITY"],
        firstRows: [
          ["May 2026", "3"],
          ["May 2027", "3"],
          ["September 2027", "5"],
        ],
      });
    });

    test("unsupported drills", async ({ page, mb }) => {
      // aggregated cell click
      const line = await createNativeQuestion(
        mb.api,
        timeseriesLineQuestionDetails,
      );
      await visitQuestion(page, line.id);
      await assertQueryBuilderRowCount(page, 10);
      await cartesianChartCircles(page).first().click();
      await expect(popover(page).getByText(/See these/)).toHaveCount(0);
      await expect(popover(page).getByText(/Breakout by/)).toHaveCount(0);
      await expect(popover(page).getByText(/Automatic insights/)).toHaveCount(0);

      // legend item click
      const categoryLine = await createNativeQuestion(
        mb.api,
        timeseriesWithCategoryLineQuestionDetails,
      );
      await visitQuestion(page, categoryLine.id);
      await page
        .getByTestId("visualization-root")
        .getByText("Gadget", { exact: true })
        .click();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    });
  });

  test.describe("query builder brush filters", () => {
    test("timeseries filter", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(
        mb.api,
        timeseriesLineQuestionDetails,
      );
      await visitQuestion(page, id);
      await assertQueryBuilderRowCount(page, 10);
      const dataset = waitForDataset(page);
      await applyBrushFilter(page, { left: 200, right: 800 });
      await dataset;
      await assertQueryBuilderRowCount(page, 4);
    });

    test("numeric filter", async ({ page, mb }) => {
      const { id } = await createNativeQuestion(mb.api, numericLineQuestionDetails);
      await visitQuestion(page, id);
      await assertQueryBuilderRowCount(page, 10);
      const dataset = waitForDataset(page);
      await applyBrushFilter(page, { left: 200, right: 800 });
      await dataset;
      await assertQueryBuilderRowCount(page, 5);
    });

    test("coordinates filter", async ({ page, mb }) => {
      // pin map
      const pinMap = await createNativeQuestion(mb.api, pinMapQuestionDetails);
      await visitQuestion(page, pinMap.id);
      await page.getByTestId("visualization-root").hover();
      await expect(
        page
          .getByTestId("visualization-root")
          .getByText("Set as default view", { exact: true }),
      ).toBeVisible();
      await page
        .getByTestId("visualization-root")
        .getByText("Draw box to filter", { exact: true })
        .click();
      const dataset = waitForDataset(page);
      await applyBoxFilter(page, { top: 100, left: 100, right: 500, bottom: 500 });
      await dataset;
      await assertQueryBuilderRowCount(page, 1);

      // grid map
      const gridMap = await createNativeQuestion(mb.api, gridMapQuestionDetails);
      await visitQuestion(page, gridMap.id);
      await page.getByTestId("visualization-root").hover();
      await expect(
        page
          .getByTestId("visualization-root")
          .getByText("Set as default view", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("visualization-root")
          .getByText("Draw box to filter", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("dashboard drills", () => {
    test("quick-filter drill", async ({ page, mb }) => {
      // cell click
      const cellDash = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: ordersTableQuestionDetails,
      });
      await visitDashboard(page, mb.api, cellDash.dashboard_id);
      await getDashboardCard(page)
        .getByText("May 15, 2027, 8:04 AM", { exact: true })
        .click();
      await expect(
        popover(page).getByText("Filter by this date and time", { exact: true }),
      ).toBeVisible();
      let dataset = waitForDataset(page);
      await popover(page).getByText("On", { exact: true }).click();
      await dataset;
      await assertQueryBuilderRowCount(page, 1);

      // aggregated cell click
      const chartDash = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: timeseriesLineQuestionDetails,
      });
      await visitDashboard(page, mb.api, chartDash.dashboard_id);
      await cartesianChartCircles(page).first().click();
      await expect(
        popover(page).getByText("Filter by this value", { exact: true }),
      ).toBeVisible();
      dataset = waitForDataset(page);
      await popover(page).getByText("=", { exact: true }).click();
      await dataset;
      await assertQueryBuilderRowCount(page, 3);
    });
  });

  test.describe("dashboard brush filters", () => {
    test("timeseries filter", async ({ page, mb }) => {
      const { dashboard_id } = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: timeseriesLineQuestionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);
      const dataset = waitForDataset(page);
      await applyBrushFilter(page, { left: 150, right: 300 });
      await dataset;
      await assertQueryBuilderRowCount(page, 4);
    });

    test("numeric filter", async ({ page, mb }) => {
      const { dashboard_id } = await createNativeQuestionAndDashboard(mb.api, {
        questionDetails: numericLineQuestionDetails,
      });
      await visitDashboard(page, mb.api, dashboard_id);
      const dataset = waitForDataset(page);
      await applyBrushFilter(page, { left: 100, right: 320 });
      await dataset;
      await assertQueryBuilderRowCount(page, 6);
    });
  });
});
