/**
 * Helpers for the longitude-binning-correctness port
 * (e2e/test/scenarios/binning/correctness/longitude.cy.spec.js).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Reuses echartsContainer (charts.ts) read-only.
 *
 *  - LONGITUDE_OPTIONS: the longitude slice of
 *    e2e/test/scenarios/binning/correctness/shared/constants.js.
 *  - openPopoverFromDefaultBucketSize: port of the same-named helper in
 *    e2e/support/helpers/e2e-notebook-helpers.ts — hover the summarize
 *    dimension row, assert its binning button shows the default bucket, click it.
 *  - assertAxisLabels / assertXAxisTicks: ports of the spec-local
 *    assertOnXYAxisLabels / assertOnXAxisTicks. ECharts SVG `<text>` tick
 *    labels carry leading/trailing (and sometimes non-breaking) whitespace and
 *    Playwright's getByText does NOT trim (PORTING wave-11 gotcha), so match
 *    against the testing-library-normalized textContent set instead — that also
 *    dodges the substring collision where "60° W" is a substring of "160° W"
 *    (findByText is an exact, whole-node match; getByText substring is not).
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { echartsContainer } from "./charts";

/** Longitude slice of shared/constants.js LONGITUDE_OPTIONS. */
export const LONGITUDE_OPTIONS: Record<
  string,
  { selected: string; representativeValues: string[] | null }
> = {
  "Auto bin": {
    selected: "Auto binned",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 0.1 degrees": {
    selected: "0.1°",
    representativeValues: null,
  },
  "Bin every 1 degree": {
    selected: "1°",
    representativeValues: ["167° W", "159° W", "69° W"],
  },
  "Bin every 10 degrees": {
    selected: "10°",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 20 degrees": {
    selected: "20°",
    representativeValues: ["180° W", "160° W", "100° W", "80° W", "60° W"],
  },
  "Bin every 0.05 degrees": {
    selected: "0.05°",
    representativeValues: null,
  },
  "Bin every 0.01 degrees": {
    selected: "0.01°",
    representativeValues: null,
  },
  "Bin every 0.005 degrees": {
    selected: "0.005°",
    representativeValues: null,
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** testing-library's default text normalizer: collapse whitespace, trim. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Port of openPopoverFromDefaultBucketSize (e2e-notebook-helpers.ts). The
 * binning button only renders on hover (`realHover` upstream), so hover the row
 * first, assert the button shows the default bucket, then click to open the
 * bucket-size popover.
 */
export async function openPopoverFromDefaultBucketSize(
  page: Page,
  column: string,
  bucket: string,
): Promise<void> {
  const row = page
    .getByTestId("dimension-list-item")
    .filter({ hasText: new RegExp(escapeRegExp(column)) })
    .first();
  await row.hover();
  const binning = row.getByTestId("dimension-list-item-binning");
  await expect(binning).toContainText(bucket);
  await binning.click();
}

/**
 * Port of assertOnXYAxisLabels: the ECharts container renders `<text>` nodes
 * containing the axis titles "Count" and "Longitude" (substring, like
 * `cy.get("text").contains(...)`).
 */
export async function assertAxisLabels(page: Page): Promise<void> {
  for (const label of ["Count", "Longitude"]) {
    await expect
      .poll(async () => {
        const texts = await echartsContainer(page)
          .locator("text")
          .allTextContents();
        return texts.some((t) => normalize(t).includes(label));
      })
      .toBe(true);
  }
}

/**
 * Port of assertOnXAxisTicks: each representative value appears as an axis tick.
 * `cy.findByText(value)` is a whole-node exact match after normalization, so
 * assert the normalized `<text>` set contains each value exactly (not substring).
 */
export async function assertXAxisTicks(
  page: Page,
  values: string[] | null,
): Promise<void> {
  if (!values) {
    return;
  }
  for (const value of values) {
    await expect
      .poll(async () => {
        const texts = await echartsContainer(page)
          .locator("text")
          .allTextContents();
        return texts.map(normalize);
      })
      .toContain(value);
  }
}
