/**
 * Playwright port of
 * e2e/test/scenarios/question/multiple-column-breakouts.cy.spec.ts
 * (no gating tags upstream — runs in OSS and EE).
 *
 * Notes on the port:
 * - The five `cy.intercept(...).as(...)` aliases become waitForResponse
 *   predicates registered before each triggering action (support module's
 *   *Response helpers). `H.visualize()` already awaits /api/dataset, so the
 *   trailing `cy.wait("@dataset")` after it is dropped (noted per site).
 * - `H.createQuestion(..., { visitQuestion: true })` →
 *   createAndVisitQuestion; `H.createQuestionAndDashboard` reimplemented so the
 *   dashboard's embedding settings survive (see support module header).
 * - `findByDisplayValue` (timeseries "All time" select, column-format inputs)
 *   → the shared filters-repros.ts findByDisplayValue (matches input value,
 *   incl. textarea/select).
 * - `H.moveDnDKitListElement("drag-handle", …)` → the shared pivot-tables.ts
 *   port (real-mouse drag).
 * - Snapshot pins database 1 to the shared H2 file / site-url to :4000; the
 *   harness re-points both on restore (fixtures.ts), so the public/embedded
 *   dashboard hops stay on this worker's backend.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { openVizTypeSidebar } from "../support/charts-extras";
import { openVizSettingsSidebar } from "../support/charts";
import { moveDnDKitListElement } from "../support/pivot-tables";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
} from "../support/dashboard";
import { tableInteractive } from "../support/models";
import {
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";
import {
  type DashboardDetails,
  type QuestionDetails,
  addBreakoutColumn,
  assertTableData,
  createAndVisitQuestion,
  createQuestion,
  createQuestionAndDashboard,
  dashcardQueryResponse,
  datasetResponse,
  embedDashcardQueryResponse,
  pivotDatasetResponse,
  publicDashcardQueryResponse,
  summarize,
  tableHeaderClick,
  toggleColumn,
} from "../support/multiple-column-breakouts";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const questionWith2TemporalBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const multiStageQuestionWith2TemporalBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-query": questionWith2TemporalBreakoutsDetails.query,
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
  },
};

const questionWith2NumBinsBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 10 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 50 },
        },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const multiStageQuestionWith2NumBinsBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-query": questionWith2NumBinsBreakoutsDetails.query,
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
  },
};

const questionWith2BinWidthBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PEOPLE.LATITUDE,
        {
          "base-type": "type/Float",
          binning: { strategy: "bin-width", "bin-width": 20 },
        },
      ],
      [
        "field",
        PEOPLE.LATITUDE,
        {
          "base-type": "type/Float",
          binning: { strategy: "bin-width", "bin-width": 10 },
        },
      ],
    ],
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const multiStageQuestionWith2BinWidthBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-query": questionWith2BinWidthBreakoutsDetails.query,
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
  },
};

const questionWith5TemporalBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "quarter" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "week" },
      ],
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "day" },
      ],
    ],
    limit: 10,
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const questionWith5NumBinsBreakoutsDetails: QuestionDetails = {
  name: "Test question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "default" },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 10 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 50 },
        },
      ],
      [
        "field",
        ORDERS.TOTAL,
        {
          "base-type": "type/Float",
          binning: { strategy: "num-bins", "num-bins": 100 },
        },
      ],
    ],
    limit: 10,
  },
  display: "table",
  visualization_settings: {
    "table.pivot": false,
  },
};

const dashboardDetails: DashboardDetails = {
  parameters: [
    {
      id: "1",
      name: "Unit1",
      slug: "unit1",
      type: "temporal-unit",
      sectionId: "temporal-unit",
    },
    {
      id: "2",
      name: "Unit2",
      slug: "unit2",
      type: "temporal-unit",
      sectionId: "temporal-unit",
    },
  ],
  enable_embedding: true,
  embedding_params: {
    unit1: "enabled",
    unit2: "enabled",
  },
};

function getNestedQuestionDetails(cardId: number): QuestionDetails {
  return {
    name: "Nested question",
    query: {
      "source-table": `card__${cardId}`,
    },
    visualization_settings: {
      "table.pivot": false,
    },
  };
}

// This is used in several places for the same query.
async function assertTableDataForFilteredTemporalBreakouts(page: Page) {
  await assertTableData(page, {
    columns: ["Created At: Year", "Created At: Month", "Count"],
    firstRows: [
      ["2029", "March 2029", "527"],
      ["2029", "April 2029", "344"],
    ],
  });
  await assertQueryBuilderRowCount(page, 2);
}

test.describe("scenarios > question > multiple column breakouts", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("current stage", () => {
    test.describe("notebook", () => {
      test("should allow to create a query with multiple breakouts", async ({
        page,
      }) => {
        async function testNewQueryWithBreakouts({
          tableName,
          columnName,
          bucketLabel,
          bucket1Name,
          bucket2Name,
        }: {
          tableName: string;
          columnName: string;
          bucketLabel: string;
          bucket1Name: string;
          bucket2Name: string;
        }) {
          // The shared startNewQuestion clicks New in the app bar, so the app
          // must already be loaded (the test opens on about:blank). Upstream's
          // current H.startNewQuestion visits a URL directly; navigating home
          // first is the equivalent that keeps using the shared helper.
          await page.goto("/");
          await startNewQuestion(page);
          await miniPicker(page)
            .getByText("Sample Database", { exact: true })
            .click();
          await miniPicker(page).getByText(tableName, { exact: true }).click();
          await getNotebookStep(page, "summarize")
            .getByText("Pick a function or metric", { exact: true })
            .click();
          await popover(page)
            .getByText("Count of rows", { exact: true })
            .click();
          await getNotebookStep(page, "summarize")
            .getByText("Pick a column to group by", { exact: true })
            .click();
          await addBreakoutColumn(page, {
            columnName,
            bucketLabel,
            bucketName: bucket1Name,
          });
          await getNotebookStep(page, "summarize")
            .getByTestId("breakout-step")
            .locator(".Icon-add")
            .click();
          await addBreakoutColumn(page, {
            columnName,
            bucketLabel,
            bucketName: bucket2Name,
          });
          await visualize(page);
        }

        // temporal breakouts
        await testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Created At",
          bucketLabel: "Temporal bucket",
          bucket1Name: "Year",
          bucket2Name: "Month",
        });
        await assertQueryBuilderRowCount(page, 49);

        // 'num-bins' breakouts
        await testNewQueryWithBreakouts({
          tableName: "Orders",
          columnName: "Total",
          bucketLabel: "Binning strategy",
          bucket1Name: "10 bins",
          bucket2Name: "50 bins",
        });
        await assertQueryBuilderRowCount(page, 32);

        // 'bin-width' breakouts
        await testNewQueryWithBreakouts({
          tableName: "People",
          columnName: "Latitude",
          bucketLabel: "Binning strategy",
          bucket1Name: "Bin every 10 degrees",
          bucket2Name: "Bin every 20 degrees",
        });
        await assertQueryBuilderRowCount(page, 6);
      });

      test("should allow to sort by breakout columns", async ({ page, mb }) => {
        async function testSortByBreakout({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);
          await getNotebookStep(page, "summarize")
            .getByText("Sort", { exact: true })
            .click();
          await popover(page).getByText(column1Name, { exact: true }).click();
          await getNotebookStep(page, "sort")
            .getByRole("button", { name: "Change direction", exact: true })
            .click();
          await getNotebookStep(page, "sort").locator(".Icon-add").click();
          await popover(page).getByText(column2Name, { exact: true }).click();
          await visualize(page);
        }

        // temporal breakouts
        await testSortByBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        await assertTableData(page, {
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [
            ["2029", "January 2029", "580"],
            ["2029", "February 2029", "543"],
          ],
        });

        // 'num-bins' breakouts
        await testSortByBreakout({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        await assertTableData(page, {
          columns: ["Total: 10 bins", "Total: 50 bins", "Count"],
          firstRows: [
            ["140  –  160", "140  –  145", "306"],
            ["140  –  160", "145  –  150", "308"],
          ],
        });

        // 'bin-width' breakouts
        await testSortByBreakout({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        await assertTableData(page, {
          columns: ["Latitude: 20°", "Latitude: 10°", "Count"],
          firstRows: [
            ["60° N  –  80° N", "60° N  –  70° N", "51"],
            ["60° N  –  80° N", "70° N  –  80° N", "1"],
          ],
        });
      });
    });

    test.describe("summarize sidebar", () => {
      test("should allow to change buckets for multiple breakouts of the same column", async ({
        page,
        mb,
      }) => {
        async function testChangeBreakoutBuckets({
          questionDetails,
          columnPattern,
          bucketLabel,
          bucket1Name,
          bucket2Name,
        }: {
          questionDetails: QuestionDetails;
          columnPattern: RegExp;
          bucketLabel: string;
          bucket1Name: string;
          bucket2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await summarize(page);

          const pinnedDimensions = page.getByTestId("pinned-dimensions");
          const columns1 = pinnedDimensions.getByLabel(columnPattern);
          await expect(columns1).toHaveCount(2);
          await columns1
            .nth(0)
            .getByLabel(bucketLabel, { exact: true })
            .hover();
          await columns1
            .nth(0)
            .getByLabel(bucketLabel, { exact: true })
            .click();
          let dataset = datasetResponse(page);
          await popover(page).getByText(bucket1Name, { exact: true }).click();
          await dataset;

          const columns2 = pinnedDimensions.getByLabel(columnPattern);
          await expect(columns2).toHaveCount(2);
          await columns2
            .nth(1)
            .getByLabel(bucketLabel, { exact: true })
            .hover();
          await columns2
            .nth(1)
            .getByLabel(bucketLabel, { exact: true })
            .click();
          dataset = datasetResponse(page);
          await popover(page).getByText(bucket2Name, { exact: true }).click();
          await dataset;
        }

        // temporal breakouts
        await testChangeBreakoutBuckets({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          columnPattern: /Created At/,
          bucketLabel: "Temporal bucket",
          bucket1Name: "Quarter",
          bucket2Name: "Week",
        });
        await assertTableData(page, {
          columns: ["Created At: Quarter", "Created At: Week", "Count"],
          firstRows: [["Q2 2025", "April 27, 2025 – May 3, 2025", "1"]],
        });

        // 'num-bin' breakouts
        await testChangeBreakoutBuckets({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          columnPattern: /Total/,
          bucketLabel: "Binning strategy",
          bucket1Name: "10 bins",
          bucket2Name: "50 bins",
        });
        await assertTableData(page, {
          columns: ["Total: 10 bins", "Total: 50 bins", "Count"],
          firstRows: [["-60  –  -40", "-50  –  -45", "1"]],
        });

        // 'bin-width' breakouts
        await testChangeBreakoutBuckets({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          columnPattern: /Latitude/,
          bucketLabel: "Binning strategy",
          bucket1Name: "Bin every 1 degree",
          bucket2Name: "Bin every 0.1 degrees",
        });
        await assertTableData(page, {
          columns: ["Latitude: 1°", "Latitude: 0.1°", "Count"],
          firstRows: [["25° N  –  26° N", "25.7° N  –  25.8° N", "1"]],
        });
      });
    });

    test.describe("timeseries chrome", () => {
      test("should use the first breakout for the chrome in case there are multiple for this column", async ({
        page,
        mb,
      }) => {
        await createAndVisitQuestion(
          page,
          mb.api,
          questionWith2TemporalBreakoutsDetails,
        );

        // change the breakout
        await expect(page.getByTestId("timeseries-bucket-button")).toContainText(
          "Year",
        );
        await page.getByTestId("timeseries-bucket-button").click();
        let dataset = datasetResponse(page);
        await popover(page).getByText("Quarter", { exact: true }).click();
        await dataset;

        await assertQueryBuilderRowCount(page, 49);
        await assertTableData(page, {
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          firstRows: [["Q2 2025", "April 2025", "1"]],
        });

        // add a filter
        await expect(page.getByTestId("timeseries-filter-button")).toContainText(
          "All time",
        );
        await page.getByTestId("timeseries-filter-button").click();
        await (await findByDisplayValue(popover(page), "All time")).click();
        await popover(page).last().getByText("On", { exact: true }).click();
        await popover(page).getByLabel("Date").fill("August 14, 2028");
        dataset = datasetResponse(page);
        await popover(page).getByRole("button", { name: "Apply" }).click();
        await dataset;
        await assertQueryBuilderRowCount(page, 1);
        await assertTableData(page, {
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          firstRows: [["Q3 2028", "August 2028", "14"]],
        });

        // change the filter
        await expect(page.getByTestId("timeseries-filter-button")).toContainText(
          "Aug 14",
        );
        await page.getByTestId("timeseries-filter-button").click();
        await popover(page).getByLabel("Date").fill("August 14, 2025");
        dataset = datasetResponse(page);
        await popover(page).getByRole("button", { name: "Apply" }).click();
        await dataset;
        await assertQueryBuilderRowCount(page, 1);
        await assertTableData(page, {
          columns: ["Created At: Quarter", "Created At: Month", "Count"],
          firstRows: [["Q3 2025", "August 2025", "1"]],
        });
      });
    });

    test.describe("viz settings", () => {
      test("should be able to change formatting settings for breakouts of the same column", async ({
        page,
        mb,
      }) => {
        async function testColumnSettings({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);

          // first breakout
          await tableHeaderClick(page, column1Name);
          await popover(page).locator(".Icon-gear").click();
          await (
            await findByDisplayValue(popover(page), column1Name)
          ).fill("Breakout1");
          await page.locator("body").click();

          // second breakout
          await tableHeaderClick(page, column2Name);
          await popover(page).locator(".Icon-gear").click();
          await (
            await findByDisplayValue(popover(page), column2Name)
          ).fill("Breakout2");
          await page.locator("body").click();
          await assertTableData(page, {
            columns: ["Breakout1", "Breakout2", "Count"],
          });
        }

        // temporal breakouts
        await testColumnSettings({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });

        // 'num-bins' breakouts
        await testColumnSettings({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });

        // 'bin-width' breakouts
        await testColumnSettings({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
      });

      test("should be able to change pivot split settings when there are more than 2 breakouts", async ({
        page,
        mb,
      }) => {
        async function testPivotSplit({
          questionDetails,
          columnNamePattern,
        }: {
          questionDetails: QuestionDetails;
          columnNamePattern: RegExp;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);

          // change display and assert the default settings
          await openVizTypeSidebar(page);
          let pivotDataset = pivotDatasetResponse(page);
          await page
            .getByTestId("chart-type-sidebar")
            .getByTestId("Pivot Table-button")
            .click();
          await pivotDataset;
          await expect(
            page.getByTestId("pivot-table").getByText(columnNamePattern),
          ).toHaveCount(3);

          // move a column from rows to columns
          await openVizSettingsSidebar(page);
          pivotDataset = pivotDatasetResponse(page);
          await moveDnDKitListElement(page, {
            testId: "drag-handle",
            startIndex: 2,
            dropIndex: 3,
          });
          await pivotDataset;
          await expect(
            page.getByTestId("pivot-table").getByText(columnNamePattern),
          ).toHaveCount(2);

          // move a column from columns to rows
          pivotDataset = pivotDatasetResponse(page);
          await moveDnDKitListElement(page, {
            testId: "drag-handle",
            startIndex: 4,
            dropIndex: 1,
          });
          await pivotDataset;
          await expect(
            page.getByTestId("pivot-table").getByText(columnNamePattern),
          ).toHaveCount(3);
        }

        // temporal breakouts
        await testPivotSplit({
          questionDetails: questionWith5TemporalBreakoutsDetails,
          columnNamePattern: /^Created At/,
        });

        // 'num-bins' breakouts
        await testPivotSplit({
          questionDetails: questionWith5NumBinsBreakoutsDetails,
          columnNamePattern: /^Total: \d+ bins$/,
        });
      });

      test("should not be able to move columns items into measures and vice-versa", async ({
        page,
        mb,
      }) => {
        await createAndVisitQuestion(
          page,
          mb.api,
          questionWith5TemporalBreakoutsDetails,
        );

        const columnNamePattern = /^Created At/;

        // change display and assert the default settings
        await openVizTypeSidebar(page);
        const pivotDataset = pivotDatasetResponse(page);
        await page
          .getByTestId("chart-type-sidebar")
          .getByTestId("Pivot Table-button")
          .click();
        await pivotDataset;
        await expect(
          page.getByTestId("pivot-table").getByText(columnNamePattern),
        ).toHaveCount(3);

        // move an item from columns to measures
        await openVizSettingsSidebar(page);
        await moveDnDKitListElement(page, {
          testId: "drag-handle",
          startIndex: 2,
          dropIndex: 5,
        });
        await expect(
          page.getByTestId("pivot-table").getByText(columnNamePattern),
        ).toHaveCount(3);

        // move an item from measures to columns
        await moveDnDKitListElement(page, {
          testId: "drag-handle",
          startIndex: 5,
          dropIndex: 2,
        });
        await expect(
          page.getByTestId("pivot-table").getByText(columnNamePattern),
        ).toHaveCount(3);
      });
    });

    test.describe("dashboards", () => {
      test("should be able to use temporal-unit parameters with multiple temporal breakouts of a column", async ({
        page,
        mb,
      }) => {
        async function setParametersAndAssertResults(
          waitFor: () => Promise<unknown>,
        ) {
          let query = waitFor();
          await filterWidget(page).nth(0).click();
          await popover(page).getByText("Quarter", { exact: true }).click();
          await query;
          query = waitFor();
          await filterWidget(page).nth(1).click();
          await popover(page).getByText("Week", { exact: true }).click();
          await query;
          const card = getDashboardCard(page);
          await expect(
            card.getByText("Created At: Quarter", { exact: true }),
          ).toBeVisible();
          await expect(
            card.getByText("Created At: Week", { exact: true }),
          ).toBeVisible();
        }

        // create dashboard
        await mb.signInAsAdmin();
        const { dashboardId } = await createQuestionAndDashboard(mb.api, {
          dashboardDetails,
          questionDetails: questionWith2TemporalBreakoutsDetails,
        });

        // visit dashboard
        await mb.signInAsNormalUser();
        await visitDashboard(page, mb.api, dashboardId);

        // add parameters
        await editDashboard(page);
        await page
          .getByTestId("fixed-width-filters")
          .getByText("Unit1", { exact: true })
          .click();
        await getDashboardCard(page)
          .getByText("Select…", { exact: true })
          .click();
        await popover(page)
          .getByText("Created At: Year", { exact: true })
          .click();
        await page
          .getByTestId("fixed-width-filters")
          .getByText("Unit2", { exact: true })
          .click();
        await getDashboardCard(page)
          .getByText("Select…", { exact: true })
          .click();
        await popover(page)
          .getByText("Created At: Month", { exact: true })
          .click();
        const dashcardAfterSave = dashcardQueryResponse(page);
        await saveDashboard(page);
        await dashcardAfterSave;

        // set parameters and assert query results
        await setParametersAndAssertResults(() => dashcardQueryResponse(page));

        // drill-thru to the QB and assert query results
        const dataset = datasetResponse(page);
        await getDashboardCard(page)
          .getByText("Test question", { exact: true })
          .click();
        await dataset;
        await expect(
          tableInteractive(page).getByText("Created At: Quarter", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          tableInteractive(page).getByText("Created At: Week", { exact: true }),
        ).toBeVisible();

        // set parameters in a public dashboard
        await mb.signInAsAdmin();
        const publicQuery = publicDashcardQueryResponse(page);
        await visitPublicDashboard(page, mb, dashboardId);
        await publicQuery;
        await setParametersAndAssertResults(() =>
          publicDashcardQueryResponse(page),
        );

        // set parameters in an embedded dashboard
        const embedQuery = embedDashcardQueryResponse(page);
        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: {},
        });
        await embedQuery;
        await setParametersAndAssertResults(() =>
          embedDashcardQueryResponse(page),
        );
      });
    });
  });

  test.describe("previous stage", () => {
    test.describe("notebook", () => {
      test("should be able to add post-aggregation expressions for each breakout column", async ({
        page,
        mb,
      }) => {
        async function testDatePostAggregationExpression({
          questionDetails,
          expression1,
          expression2,
        }: {
          questionDetails: QuestionDetails;
          expression1: string;
          expression2: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);

          // add a post-aggregation expression for the first column
          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Custom column" })
            .click();
          await enterCustomColumnDetails(page, {
            formula: expression1,
            name: "Expression1",
          });
          await popover(page).getByRole("button", { name: "Done" }).click();

          // add a post-aggregation expression for the second column
          await getNotebookStep(page, "expression", { stage: 1 })
            .locator(".Icon-add")
            .click();
          await enterCustomColumnDetails(page, {
            formula: expression2,
            name: "Expression2",
          });
          await popover(page).getByRole("button", { name: "Done" }).click();

          // assert query results
          await visualize(page);
        }

        // Fragile and bound to break when the year changes
        // temporal breakouts
        await testDatePostAggregationExpression({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          expression1: 'datetimeAdd([Created At: Year], 1, "year")',
          expression2: 'datetimeAdd([Created At: Month], 1, "month")',
        });
        await assertTableData(page, {
          columns: [
            "Created At: Year",
            "Created At: Month",
            "Count",
            "Expression1",
            "Expression2",
          ],
          firstRows: [
            [
              "2025",
              "April 2025",
              "1",
              "January 1, 2026, 12:00 AM",
              "May 1, 2025, 12:00 AM",
            ],
          ],
        });

        // 'num-bins' breakouts
        await testDatePostAggregationExpression({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          expression1: "[Total: 10 bins] + 100",
          expression2: "[Total: 10 bins] + 200",
        });
        await assertTableData(page, {
          columns: [
            "Total: 10 bins",
            "Total: 50 bins",
            "Count",
            "Expression1",
            "Expression2",
          ],
          firstRows: [["-60  –  -40", "-50  –  -45", "1", "40", "140"]],
        });

        // 'max-bins' breakouts
        await testDatePostAggregationExpression({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          expression1: "[Latitude: 20°] + 100",
          expression2: "[Latitude: 10°] + 200",
        });
        await assertTableData(page, {
          columns: [
            "Latitude: 20°",
            "Latitude: 10°",
            "Count",
            "Expression1",
            "Expression2",
          ],
          firstRows: [["20° N  –  40° N", "20° N  –  30° N", "87", "120", "220"]],
        });
      });

      test("should be able to add post-aggregation filters for each breakout column", async ({
        page,
        mb,
      }) => {
        async function addDateBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: string;
          columnMaxValue: string;
        }) {
          const p = popover(page);
          await p.getByText(columnName, { exact: true }).click();
          await p.getByText("Fixed date range…", { exact: true }).click();
          await p.getByText("Between", { exact: true }).click();
          await p.getByLabel("Start date").fill(columnMinValue);
          await p.getByLabel("End date").fill(columnMaxValue);
          await p.getByRole("button", { name: "Add filter" }).click();
        }

        async function testDatePostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column1MinValue: string;
          column1MaxValue: string;
          column2Name: string;
          column2MinValue: string;
          column2MaxValue: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);

          // add a filter for the first column
          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Filter" })
            .click();
          await addDateBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          // add a filter for the second column
          await getNotebookStep(page, "filter", { stage: 1 })
            .locator(".Icon-add")
            .click();
          await addDateBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          // assert query results
          await visualize(page);
        }

        async function addNumericBetweenFilter({
          columnName,
          columnMinValue,
          columnMaxValue,
        }: {
          columnName: string;
          columnMinValue: number;
          columnMaxValue: number;
        }) {
          const p = popover(page);
          await p.getByText(columnName, { exact: true }).click();
          await p
            .getByPlaceholder("Min", { exact: true })
            .fill(String(columnMinValue));
          await p
            .getByPlaceholder("Max", { exact: true })
            .fill(String(columnMaxValue));
          await p.getByRole("button", { name: "Add filter" }).click();
        }

        async function testNumericPostAggregationFilter({
          questionDetails,
          column1Name,
          column1MinValue,
          column1MaxValue,
          column2Name,
          column2MinValue,
          column2MaxValue,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column1MinValue: number;
          column1MaxValue: number;
          column2Name: string;
          column2MinValue: number;
          column2MaxValue: number;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);

          // add a filter for the first column
          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Filter" })
            .click();
          await addNumericBetweenFilter({
            columnName: column1Name,
            columnMinValue: column1MinValue,
            columnMaxValue: column1MaxValue,
          });

          // add a filter for the second column
          await getNotebookStep(page, "filter", { stage: 1 })
            .locator(".Icon-add")
            .click();
          await addNumericBetweenFilter({
            columnName: column2Name,
            columnMinValue: column2MinValue,
            columnMaxValue: column2MaxValue,
          });

          // assert query results
          await visualize(page);
        }

        // temporal buckets
        await testDatePostAggregationFilter({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column1MinValue: "January 1, 2029",
          column1MaxValue: "December 31, 2029",
          column2Name: "Created At: Month",
          column2MinValue: "March 1, 2029",
          column2MaxValue: "May 31, 2029",
        });
        await assertTableDataForFilteredTemporalBreakouts(page);

        // 'num-bins' breakouts
        await testNumericPostAggregationFilter({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Total: 50 bins",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        await assertTableData(page, {
          columns: ["Total: 10 bins", "Total: 50 bins", "Count"],
          firstRows: [
            ["20  –  40", "20  –  25", "214"],
            ["20  –  40", "25  –  30", "396"],
          ],
        });
        await assertQueryBuilderRowCount(page, 7);

        // 'bin-width' breakouts
        await testNumericPostAggregationFilter({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column1MinValue: 10,
          column1MaxValue: 50,
          column2Name: "Latitude: 10°",
          column2MinValue: 10,
          column2MaxValue: 50,
        });
        await assertTableData(page, {
          columns: ["Latitude: 20°", "Latitude: 10°", "Count"],
          firstRows: [
            ["20° N  –  40° N", "20° N  –  30° N", "87"],
            ["20° N  –  40° N", "30° N  –  40° N", "1,176"],
          ],
        });
        await assertQueryBuilderRowCount(page, 4);
      });

      test("should be able to add post-aggregation aggregations for each breakout column", async ({
        page,
        mb,
      }) => {
        async function testPostAggregationAggregation({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);

          // add an aggregation for the first column
          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Summarize" })
            .click();
          await popover(page)
            .getByText("Minimum of ...", { exact: true })
            .click();
          await popover(page).getByText(column1Name, { exact: true }).click();

          // add an aggregation for the second column
          await getNotebookStep(page, "summarize", { stage: 1 })
            .locator(".Icon-add")
            .click();
          await popover(page)
            .getByText("Maximum of ...", { exact: true })
            .click();
          await popover(page).getByText(column2Name, { exact: true }).click();

          // assert query results
          await visualize(page);
        }

        // temporal breakouts
        await testPostAggregationAggregation({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        await assertTableData(page, {
          columns: ["Min of Created At: Year", "Max of Created At: Month"],
          firstRows: [["January 1, 2025, 12:00 AM", "April 1, 2029, 12:00 AM"]],
        });

        // 'num-bins' breakouts
        await testPostAggregationAggregation({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        await assertTableData(page, {
          columns: ["Min of Total: 10 bins", "Max of Total: 50 bins"],
          firstRows: [["-60", "155"]],
        });

        // 'max-bins' breakouts
        await testPostAggregationAggregation({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        await assertTableData(page, {
          columns: ["Min of Latitude: 20°", "Max of Latitude: 10°"],
          firstRows: [["20.00000000° N", "70.00000000° N"]],
        });
      });

      test("should be able to add post-aggregation breakouts for each breakout column", async ({
        page,
        mb,
      }) => {
        async function testPostAggregationBreakout({
          questionDetails,
          column1Name,
          column2Name,
        }: {
          questionDetails: QuestionDetails;
          column1Name: string;
          column2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await openNotebook(page);

          // add an aggregation
          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Summarize" })
            .click();
          await popover(page)
            .getByText("Count of rows", { exact: true })
            .click();

          // add a breakout for the first breakout column
          await getNotebookStep(page, "summarize", { stage: 1 })
            .getByTestId("breakout-step")
            .getByText("Pick a column to group by", { exact: true })
            .click();
          await popover(page).getByText(column1Name, { exact: true }).click();

          // add a breakout for the second breakout column
          await getNotebookStep(page, "summarize", { stage: 1 })
            .getByTestId("breakout-step")
            .locator(".Icon-add")
            .click();
          await popover(page).getByText(column2Name, { exact: true }).click();

          // assert query results
          await visualize(page);
        }

        // temporal breakouts
        await testPostAggregationBreakout({
          questionDetails: questionWith2TemporalBreakoutsDetails,
          column1Name: "Created At: Year",
          column2Name: "Created At: Month",
        });
        await assertTableData(page, {
          columns: ["Created At: Year", "Created At: Month", "Count"],
          firstRows: [["2025", "April 2025", "1"]],
        });

        // 'num-bins' breakouts
        await testPostAggregationBreakout({
          questionDetails: questionWith2NumBinsBreakoutsDetails,
          column1Name: "Total: 10 bins",
          column2Name: "Total: 50 bins",
        });
        await assertTableData(page, {
          columns: ["Total: 10 bins", "Total: 50 bins", "Count"],
          firstRows: [
            ["-60  –  -40", "-50  –  -45", "1"],
            ["0  –  20", "5  –  10", "1"],
          ],
        });

        // 'max-bins' breakouts
        await testPostAggregationBreakout({
          questionDetails: questionWith2BinWidthBreakoutsDetails,
          column1Name: "Latitude: 20°",
          column2Name: "Latitude: 10°",
        });
        await assertTableData(page, {
          columns: ["Latitude: 20°", "Latitude: 10°", "Count"],
          firstRows: [
            ["20° N  –  40° N", "20° N  –  30° N", "1"],
            ["20° N  –  40° N", "30° N  –  40° N", "1"],
          ],
        });
      });
    });

    test.describe("viz settings", () => {
      test("should be able to toggle the fields that correspond to breakout columns in the previous stage", async ({
        page,
        mb,
      }) => {
        async function testVisibleFields({
          questionDetails,
          queryColumn1Name,
          queryColumn2Name,
          tableColumn1Name,
          tableColumn2Name,
        }: {
          questionDetails: QuestionDetails;
          queryColumn1Name: string;
          queryColumn2Name: string;
          tableColumn1Name: string;
          tableColumn2Name: string;
        }) {
          await createAndVisitQuestion(page, mb.api, questionDetails);
          await assertTableData(page, {
            columns: [tableColumn1Name, tableColumn2Name, "Count"],
          });

          const sidebar = page.getByTestId("chartsettings-sidebar");
          await openVizSettingsSidebar(page);
          await sidebar
            .getByRole("button", { name: "Add or remove columns" })
            .click();

          let dataset = datasetResponse(page);
          await toggleColumn(sidebar, queryColumn1Name, false);
          await dataset;
          await assertTableData(page, { columns: [tableColumn2Name, "Count"] });

          dataset = datasetResponse(page);
          await toggleColumn(sidebar, queryColumn2Name, false);
          await dataset;
          await assertTableData(page, { columns: ["Count"] });

          dataset = datasetResponse(page);
          await toggleColumn(sidebar, queryColumn1Name, true);
          await dataset;
          await assertTableData(page, { columns: ["Count", tableColumn1Name] });

          await toggleColumn(sidebar, queryColumn2Name, true);
          await assertTableData(page, {
            columns: ["Count", tableColumn1Name, tableColumn2Name],
          });
        }

        // temporal breakouts
        await testVisibleFields({
          questionDetails: multiStageQuestionWith2TemporalBreakoutsDetails,
          queryColumn1Name: "Created At: Year",
          queryColumn2Name: "Created At: Month",
          tableColumn1Name: "Created At: Year",
          tableColumn2Name: "Created At: Month",
        });

        // 'num-bins' breakouts
        await testVisibleFields({
          questionDetails: multiStageQuestionWith2NumBinsBreakoutsDetails,
          queryColumn1Name: "Total: 10 bins",
          queryColumn2Name: "Total: 50 bins",
          tableColumn1Name: "Total: 10 bins",
          tableColumn2Name: "Total: 50 bins",
        });

        // 'bin-width' breakouts
        await testVisibleFields({
          questionDetails: multiStageQuestionWith2BinWidthBreakoutsDetails,
          queryColumn1Name: "Latitude: 20°",
          queryColumn2Name: "Latitude: 10°",
          tableColumn1Name: "Latitude: 20°",
          tableColumn2Name: "Latitude: 10°",
        });
      });
    });
  });

  test.describe("data source", () => {
    test.describe("viz settings", () => {
      test("should be able to toggle the fields that correspond to breakout columns in the source card", async ({
        page,
        mb,
      }) => {
        async function testVisibleFields({
          questionDetails,
          columnName,
        }: {
          questionDetails: QuestionDetails;
          columnName: string;
        }) {
          const card = await createQuestion(mb.api, questionDetails);
          await createAndVisitQuestion(
            page,
            mb.api,
            getNestedQuestionDetails(card.id),
          );
          const columnNameYear = columnName + ": Year";
          const columnNameMonth = columnName + ": Month";
          await assertTableData(page, {
            columns: [columnNameYear, columnNameMonth, "Count"],
          });

          const sidebar = page.getByTestId("chartsettings-sidebar");
          await openVizSettingsSidebar(page);
          await sidebar
            .getByRole("button", { name: "Add or remove columns" })
            .click();

          let dataset = datasetResponse(page);
          await toggleColumn(sidebar, columnNameYear, false);
          await dataset;
          await assertTableData(page, { columns: [columnNameMonth, "Count"] });

          dataset = datasetResponse(page);
          await toggleColumn(sidebar, columnNameMonth, false);
          await dataset;
          await assertTableData(page, { columns: ["Count"] });

          dataset = datasetResponse(page);
          await toggleColumn(sidebar, columnNameYear, true);
          await dataset;
          await assertTableData(page, { columns: ["Count", columnNameYear] });

          await toggleColumn(sidebar, columnNameMonth, true);
          await assertTableData(page, {
            columns: ["Count", columnNameYear, columnNameMonth],
          });
        }

        // temporal breakouts
        await testVisibleFields({
          questionDetails: multiStageQuestionWith2TemporalBreakoutsDetails,
          columnName: "Created At",
        });
      });
    });
  });
});
