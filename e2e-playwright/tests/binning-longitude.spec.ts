/**
 * Playwright port of
 * e2e/test/scenarios/binning/correctness/longitude.cy.spec.js
 * (no gating tags upstream — runs in OSS and EE).
 *
 * Correctness of longitude binning: open the People table, Summarize, group by
 * Longitude at each bucket width (Auto / 0.1° / 1° / 10° / 20° / 0.05° / 0.01° /
 * 0.005°), and assert the question title, the brand-blue bar path, the axis
 * labels, and the representative x-axis tick values. Plus a "Don't bin" case
 * asserting the unbinned table cells.
 *
 * Notes on the port:
 * - `H.openPeopleTable()` / `H.summarize()` → the shared ports (simple mode).
 * - `openPopoverFromDefaultBucketSize` (e2e-notebook-helpers.ts) is ported in
 *   support/binning-longitude.ts (hover-gated binning button — PORTING rule 4).
 * - `cy.findByText(str)` → exact getByText (PORTING rule 1).
 * - Axis-tick assertions match the testing-library-normalized `<text>` set,
 *   not getByText substring (PORTING wave-11: Playwright doesn't trim ECharts
 *   axis text, and "60° W" is a substring of "160° W") — see the helper header.
 * - `cy.get("li[aria-selected='true']").should("contain", …)` → the single
 *   selected dimension list item; assert it contains both strings.
 * - `cy.get("[data-testid=cell-data]").should("contain", …)` is an ANY-of-set
 *   assertion (chai-jquery :contains over many cells) → `.filter().first()`
 *   per PORTING rule 3.
 * - `cy.viewport(1440, 800)` → page.setViewportSize (upstream widens the
 *   viewport to fit the dense x-axis ticks).
 */
import { chartPathWithFillColor } from "../support/binning";
import {
  LONGITUDE_OPTIONS,
  assertAxisLabels,
  assertXAxisTicks,
  openPopoverFromDefaultBucketSize,
} from "../support/binning-longitude";
import { openPeopleTable } from "../support/column-extract-drill";
import { test, expect } from "../support/fixtures";
import { summarize } from "../support/models";
import { popover } from "../support/ui";

test.describe("scenarios > binning > correctness > longitude", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openPeopleTable(page);
    await summarize(page);
    await openPopoverFromDefaultBucketSize(page, "Longitude", "Auto bin");
  });

  for (const [bucketSize, { selected, representativeValues }] of Object.entries(
    LONGITUDE_OPTIONS,
  )) {
    test(`should return correct values for ${bucketSize}`, async ({ page }) => {
      // Increase viewport to allow checking x-axis ticks values on dense data
      await page.setViewportSize({ width: 1440, height: 800 });

      await popover(page).getByText("More…", { exact: true }).click();
      await popover(page).getByText(bucketSize, { exact: true }).click();

      const selectedItem = page
        .locator("li[aria-selected='true']")
        .filter({ hasText: "Longitude" })
        .first();
      await expect(selectedItem).toContainText("Longitude");
      await expect(selectedItem).toContainText(selected);

      await page.getByText("Done", { exact: true }).click();

      await expect(
        page
          .getByText(`Count by Longitude: ${selected}`, { exact: true })
          .first(),
      ).toBeVisible();
      await expect(chartPathWithFillColor(page, "#509EE3").first()).toBeVisible();

      await assertAxisLabels(page);
      await assertXAxisTicks(page, representativeValues);
    });
  }

  test("Don't bin", async ({ page }) => {
    await popover(page).getByText("More…", { exact: true }).click();
    await popover(page).getByText("Don't bin", { exact: true }).click();

    const selectedItem = page
      .locator("li[aria-selected='true']")
      .filter({ hasText: "Longitude" })
      .first();
    await expect(selectedItem).toContainText("Longitude");
    await expect(selectedItem).toContainText("Unbinned");

    await page.getByText("Done", { exact: true }).click();

    await expect(
      page.getByText("Count by Longitude", { exact: true }).first(),
    ).toBeVisible();

    const cellData = page.getByTestId("cell-data");
    await expect(cellData.filter({ hasText: "Longitude" }).first()).toBeVisible();
    await expect(cellData.filter({ hasText: "Count" }).first()).toBeVisible();
    await expect(
      cellData.filter({ hasText: "166.54257260° W" }).first(),
    ).toBeVisible();
    await expect(cellData.filter({ hasText: "1" }).first()).toBeVisible();
  });
});
