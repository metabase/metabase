/**
 * Playwright port of e2e/test/scenarios/binning/qb-regular-table.cy.spec.js
 *
 * Binning a regular table's columns via the summarize sidebar, the notebook
 * editor, and the table column header ("Distribution").
 *
 * Chart-label assertions (axis ticks like "70", "Q1 2026") are scoped to the
 * echarts container — the Cypress originals were unscoped page-level
 * findByText calls on chart-only strings.
 */
import type { Page } from "@playwright/test";

import {
  changeBinningForDimension,
  chartPathWithFillColor,
  openTable,
} from "../support/binning";
import { echartsContainer } from "../support/charts";
import { test, expect } from "../support/fixtures";
import { cartesianChartCircles } from "../support/metrics";
import { summarize } from "../support/models";
import { tableHeaderClick, visualize } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

test.describe("scenarios > binning > binning options", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("via simple question", () => {
    test("should work for number", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Total",
        defaultBucket: "Auto bin",
        bucketSize: "50 bins",
      });

      await getTitle(page, "Count by Total: 50 bins");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("70", { exact: true }),
      ).toBeVisible();
    });

    test("should work for time series", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Created At",
        defaultBucket: "by month",
        bucketSize: "Quarter",
      });

      await getTitle(page, "Count by Created At: Quarter");

      await expect(cartesianChartCircles(page).first()).toBeVisible();
      await expect(
        echartsContainer(page).getByText("Q1 2026", { exact: true }),
      ).toBeVisible();
    });

    test("should work for longitude/latitude", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: PEOPLE_ID,
        column: "Longitude",
        defaultBucket: "Auto bin",
        bucketSize: "Bin every 20 degrees",
      });

      await getTitle(page, "Count by Longitude: 20°");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("180° W", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("via custom question", () => {
    test("should work for number", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Total",
        defaultBucket: "Auto bin",
        bucketSize: "50 bins",
        mode: "notebook",
      });

      await getTitle(page, "Count by Total: 50 bins");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("70", { exact: true }),
      ).toBeVisible();
    });

    test("should work for time series", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Created At",
        defaultBucket: "by month",
        bucketSize: "Quarter",
        mode: "notebook",
      });

      await getTitle(page, "Count by Created At: Quarter");

      await expect(cartesianChartCircles(page).first()).toBeVisible();
      await expect(
        echartsContainer(page).getByText("Q1 2026", { exact: true }),
      ).toBeVisible();
    });

    test("should work for longitude/latitude", async ({ page }) => {
      await chooseInitialBinningOption(page, {
        table: PEOPLE_ID,
        column: "Longitude",
        defaultBucket: "Auto bin",
        bucketSize: "Bin every 20 degrees",
        mode: "notebook",
      });

      await getTitle(page, "Count by Longitude: 20°");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("180° W", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("via column popover", () => {
    test("should work for number", async ({ page }) => {
      await openTable(page, { table: ORDERS_ID });
      await tableHeaderClick(page, "Total");
      await popover(page).getByText("Distribution", { exact: true }).click();

      await getTitle(page, "Count by Total: Auto binned");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("60", { exact: true }),
      ).toBeVisible();
    });

    test("should work for time series", async ({ page }) => {
      await openTable(page, { table: ORDERS_ID });
      await tableHeaderClick(page, "Created At");
      await popover(page).getByText("Distribution", { exact: true }).click();

      await getTitle(page, "Count by Created At: Month");

      await expect(cartesianChartCircles(page).first()).toBeVisible();
      await expect(
        echartsContainer(page).getByText("January 2026", { exact: true }),
      ).toBeVisible();
    });

    test("should work for longitude/latitude", async ({ page }) => {
      await openTable(page, { table: PEOPLE_ID });
      await tableHeaderClick(page, "Longitude");
      await popover(page).getByText("Distribution", { exact: true }).click();

      await getTitle(page, "Count by Longitude: Auto binned");

      await expect(
        chartPathWithFillColor(page, "#509EE3").first(),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText("170° W", { exact: true }),
      ).toBeVisible();
    });
  });
});

async function chooseInitialBinningOption(
  page: Page,
  {
    table,
    column,
    defaultBucket,
    bucketSize,
    mode,
  }: {
    table: number;
    column: string;
    defaultBucket: string;
    bucketSize: string;
    mode?: "notebook";
  },
) {
  await openTable(page, { table, mode });
  await summarize(page, { mode });

  if (mode === "notebook") {
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await page.getByText("Pick a column to group by", { exact: true }).click();

    await changeBinningForDimension(page, {
      name: column,
      fromBinning: defaultBucket,
      toBinning: bucketSize,
    });

    await visualize(page);
  } else {
    await changeBinningForDimension(page, {
      name: column,
      fromBinning: defaultBucket,
      toBinning: bucketSize,
    });
  }
}

async function getTitle(page: Page, title: string) {
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
