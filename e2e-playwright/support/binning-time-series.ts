/**
 * Spec-local helpers for the binning time-series correctness port
 * (e2e/test/scenarios/binning/correctness/time-series.cy.spec.js).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). The heavy lifting (getBinningButtonForDimension)
 * is imported read-only from support/binning.ts.
 *
 * DATE-ASSERTING: the representative table values below are date labels
 * ("April 30, 2025", "Q1 2027", …). CI runs with TZ=US/Pacific
 * process-wide; run this port locally with the same TZ to match.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { getBinningButtonForDimension } from "./binning";

export type TimeOption = {
  selected: string;
  representativeValues: string[];
  type?: string;
  isHiddenByDefault?: boolean;
};

/** Port of TIME_OPTIONS (binning/correctness/shared/constants.js). */
export const TIME_OPTIONS: Record<string, TimeOption> = {
  Minute: {
    selected: "by minute",
    representativeValues: ["April 30, 2025, 6:56 PM", "May 10, 2025, 9:38 AM"],
  },
  Hour: {
    selected: "by hour",
    representativeValues: ["April 30, 2025, 6:00 PM", "May 10, 2025, 9:00 AM"],
  },
  Day: {
    selected: "by day",
    representativeValues: ["April 30, 2025", "May 10, 2025"],
  },
  Week: {
    selected: "by week",
    representativeValues: [
      "April 27, 2025 – May 3, 2025",
      "May 11, 2025 – May 17, 2025",
    ],
  },
  Month: {
    selected: "by month",
    representativeValues: ["April 2025", "May 2025"],
  },
  Quarter: {
    selected: "by quarter",
    representativeValues: ["Q2 2025", "Q1 2026", "Q1 2027", "Q1 2028"],
  },
  Year: {
    selected: "by year",
    representativeValues: ["2025", "2026", "2027", "2028", "2029"],
  },
  "Minute of hour": {
    selected: "by minute of hour",
    representativeValues: ["0", "5", "8", "13"],
    type: "extended",
    isHiddenByDefault: true,
  },
  "Hour of day": {
    selected: "by hour of day",
    representativeValues: ["12:00 AM", "3:00 AM", "12:00 PM", "8:00 PM"],
    isHiddenByDefault: true,
  },
  "Day of week": {
    selected: "by day of week",
    representativeValues: ["Saturday", "Tuesday", "Friday", "Sunday"],
    isHiddenByDefault: true,
  },
  "Day of month": {
    selected: "by day of month",
    representativeValues: ["5", "10", "15", "30"],
    isHiddenByDefault: true,
  },
  "Day of year": {
    selected: "by day of year",
    representativeValues: ["1", "10", "12"],
    isHiddenByDefault: true,
  },
  "Week of year": {
    selected: "by week of year",
    representativeValues: ["1st", "2nd", "3rd", "10th"],
    isHiddenByDefault: true,
  },
  "Month of year": {
    selected: "by month of year",
    representativeValues: ["January", "June", "December"],
    isHiddenByDefault: true,
  },
  "Quarter of year": {
    selected: "by quarter of year",
    representativeValues: ["Q1", "Q2", "Q3", "Q4"],
    isHiddenByDefault: true,
  },
};

/**
 * Port of the spec-local openPopoverFromDefaultBucketSize: assert the
 * dimension's binning button shows the default bucket, then force-click it to
 * open the bucket-selection popover.
 */
export async function openPopoverFromDefaultBucketSize(
  page: Page,
  name: string,
  bucket: string,
) {
  const binningButton = await getBinningButtonForDimension(page, { name });
  await expect(binningButton).toHaveText(bucket);
  await binningButton.click({ force: true });
}

/**
 * Port of the spec-local assertOnHeaderCells: the first two header cells are
 * the grouped column ("Created At: <bucket>") and "Count". Cypress `.contains`
 * on a single cell → substring assertion.
 */
export async function assertOnHeaderCells(page: Page, bucketSize: string) {
  const cellData = page.getByTestId("cell-data");
  await expect(cellData.nth(0)).toContainText(`Created At: ${bucketSize}`);
  await expect(cellData.nth(1)).toContainText("Count");
}

/**
 * Port of the spec-local assertOnTableValues: each representative value appears
 * in some cell and can be scrolled to (Cypress `cy.contains(v).scrollIntoView()`
 * — first substring match; `.scrollIntoView()` implicitly asserts existence).
 */
export async function assertOnTableValues(page: Page, values: string[]) {
  const cellData = page.getByTestId("cell-data");
  const scrollContainer = page.getByTestId("table-scroll-container");
  for (const value of values) {
    const cell = cellData.filter({ hasText: value }).first();
    // The QB results table is virtualized (react-window). Two problems: a cell
    // can detach mid-scroll ("Element is not attached to the DOM"), and rows
    // below the render buffer aren't in the DOM at all (Playwright's viewport
    // renders fewer rows than Cypress's, where Cypress's progressive
    // scrollIntoView revealed later rows like day-of-month "30"). Wheel the
    // body down when the value isn't rendered yet — values are checked in
    // ascending order, so scrolling stays monotonic — then re-resolve.
    await expect(async () => {
      if ((await cell.count()) === 0) {
        await scrollContainer.hover();
        await page.mouse.wheel(0, 300);
      }
      await cell.scrollIntoViewIfNeeded({ timeout: 1000 });
    }).toPass();
  }
}

/**
 * Port of the spec-local assertOnTimeSeriesFooter: the footer filter button is
 * "All time" (exact) and the bucket button contains the bucket size (substring).
 */
export async function assertOnTimeSeriesFooter(page: Page, str: string) {
  await expect(page.getByTestId("timeseries-filter-button")).toHaveText(
    "All time",
  );
  await expect(page.getByTestId("timeseries-bucket-button")).toContainText(str);
}
