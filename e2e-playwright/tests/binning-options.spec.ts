/**
 * Playwright port of e2e/test/scenarios/binning/binning-options.cy.spec.js
 *
 * Makes sure that all binning options (bucket sizes) are rendered correctly
 * for the regular table:
 *  1. no option should be rendered multiple times (Playwright strict mode
 *     doubles as this implicit assertion)
 *  2. the selected option should be highlighted when the popover with all
 *     options opens
 *
 * This spec covers the following issues:
 *  - metabase#15574
 *
 * The Cypress beforeEach registered a POST /api/dataset intercept
 * ("@dataset") that was never awaited — dropped per PORTING.md rule 2.
 */
import type { Page } from "@playwright/test";

import { getBinningButtonForDimension, openTable } from "../support/binning";
import { test, expect } from "../support/fixtures";
import { summarize } from "../support/models";
import { tableHeaderClick } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const NUMBER_BUCKETS = [
  "Auto bin",
  "10 bins",
  "50 bins",
  "100 bins",
  "Don't bin",
];

const TIME_BUCKETS = [
  "Minute",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "Minute of hour",
  "Hour of day",
  "Day of week",
  "Day of month",
  "Day of year",
  "Week of year",
  "Month of year",
  "Quarter of year",
  "Don't bin",
];

const LONGITUDE_BUCKETS = [
  "Auto bin",
  "Bin every 0.1 degrees",
  "Bin every 1 degree",
  "Bin every 10 degrees",
  "Bin every 20 degrees",
  "Bin every 0.05 degrees",
  "Bin every 0.01 degrees",
  "Bin every 0.005 degrees",
  "Don't bin",
];

test.describe("scenarios > binning > binning options", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("via simple question", () => {
    test("should render number binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Total",
      });
      await getTitle(page, "Count by Total: Auto binned");

      await openBinningListForDimension(page, "Total", "Auto binned");
      await getAllOptions(page, {
        options: NUMBER_BUCKETS,
        isSelected: "Auto bin",
      });
    });

    test("should render time series binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        column: "Created At",
      });
      await getTitle(page, "Count by Created At: Month");

      await openBinningListForDimension(page, "Created At", "by month");
      await getAllOptions(page, {
        options: TIME_BUCKETS,
        isSelected: "Month",
        shouldExpandList: true,
      });
    });

    test("should render longitude/latitude binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: PEOPLE_ID,
        column: "Longitude",
      });
      await getTitle(page, "Count by Longitude: Auto binned");

      await openBinningListForDimension(page, "Longitude", "Auto binned");
      await getAllOptions(page, {
        options: LONGITUDE_BUCKETS,
        isSelected: "Auto bin",
        shouldExpandList: true,
      });
    });
  });

  test.describe("via custom question", () => {
    test("should render number binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        mode: "notebook",
        column: "Total",
      });

      await getTitle(page, "Count by Total: Auto binned");

      await page.getByText("Total: Auto binned", { exact: true }).click();
      await openBinningListForDimension(page, "Total", "Auto binned");

      await getAllOptions(page, {
        options: NUMBER_BUCKETS,
        isSelected: "Auto bin",
      });
    });

    test("should render time series binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: ORDERS_ID,
        mode: "notebook",
        column: "Created At",
      });

      await getTitle(page, "Count by Created At: Month");

      await page.getByText("Created At: Month", { exact: true }).click();
      await openBinningListForDimension(page, "Created At", "by month");

      await getAllOptions(page, {
        options: TIME_BUCKETS,
        isSelected: "Month",
        shouldExpandList: true,
      });
    });

    test("should render longitude/latitude binning options correctly", async ({
      page,
    }) => {
      await chooseInitialBinningOption(page, {
        table: PEOPLE_ID,
        mode: "notebook",
        column: "Longitude",
      });

      await getTitle(page, "Count by Longitude: Auto binned");

      await page.getByText("Longitude: Auto binned", { exact: true }).click();
      await openBinningListForDimension(page, "Longitude", "Auto binned");

      await getAllOptions(page, {
        options: LONGITUDE_BUCKETS,
        isSelected: "Auto bin",
        shouldExpandList: true,
      });
    });
  });

  test.describe("via time series footer (metabase#11183)", () => {
    test("should render time series binning options correctly", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });
      await tableHeaderClick(page, "Created At");
      await popover(page).getByText("Distribution", { exact: true }).click();
      await getTitle(page, "Count by Created At: Month");
      await page.getByTestId("timeseries-bucket-button").click();
      await expect(
        popover(page).getByText("Month", { exact: true }).locator(".."),
      ).toHaveAttribute("aria-selected", "true");
    });
  });
});

async function chooseInitialBinningOption(
  page: Page,
  {
    table,
    column,
    mode,
  }: { table: number; column: string; mode?: "notebook" },
) {
  await openTable(page, { table, mode });
  await summarize(page, { mode });

  if (mode === "notebook") {
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await page
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText(column, { exact: true }).click();
  } else {
    // cy.contains is case-sensitive substring, first match — hence the regex.
    await page
      .getByTestId("sidebar-right")
      .getByText(new RegExp(escapeRegExp(column)))
      .first()
      .click();
  }
}

async function openBinningListForDimension(
  page: Page,
  column: string,
  binning: string,
) {
  const binningButton = await getBinningButtonForDimension(page, {
    name: column,
    isSelected: true,
  });
  await expect(binningButton).toContainText(binning);
  await binningButton.click();
}

async function getTitle(page: Page, title: string) {
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

async function getAllOptions(
  page: Page,
  {
    options,
    isSelected,
    shouldExpandList = false,
  }: { options: string[]; isSelected: string; shouldExpandList?: boolean },
) {
  const regularOptions = options.filter((option) => option !== isSelected);

  // Custom question has two popovers open.
  // The binning options are in the latest (last) one.
  // Using .last() works even when only one popover is open, covering both.
  const binningPopover = popover(page).last();

  if (shouldExpandList) {
    await binningPopover.getByText("More…", { exact: true }).click();
  }

  for (const option of regularOptions) {
    // Strict mode makes this fail if the string is rendered multiple times.
    await expect(
      binningPopover.getByText(option, { exact: true }),
    ).toBeVisible();
  }

  await expect(
    binningPopover
      .getByText(isSelected, { exact: true })
      .locator("xpath=ancestor-or-self::li[1]"),
  ).toHaveAttribute("aria-selected", "true");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
