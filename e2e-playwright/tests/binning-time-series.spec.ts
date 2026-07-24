/**
 * Playwright port of
 * e2e/test/scenarios/binning/correctness/time-series.cy.spec.js
 *
 * Correctness of time-series binning: group Orders by Created At at each
 * temporal unit (minute / hour / day / week / month / quarter / year, plus the
 * "of period" extended units) and assert the resulting header labels, table
 * values, and time-series footer.
 *
 * Issues covered: metabase#11183.
 *
 * DATE-ASSERTING: representative values are date labels. CI runs with
 * TZ=US/Pacific process-wide (Playwright inherits it, no timezoneId set); run
 * this port locally with the same TZ or date-only values shift a day.
 *
 * Notes:
 *  - `H.createQuestion(details, { visitQuestion: true })` → createQuestion
 *    factory + the shared visitQuestion port.
 *  - `cy.wait("@dataset")` → waitForDataset registered before the bucket click
 *    (PORTING rule 2).
 *  - `cy.findByText(bucketSize)` → exact getByText (rule 1). The extended units
 *    are revealed by clicking "More…" first (isHiddenByDefault).
 */
import { getBinningButtonForDimension } from "../support/binning";
import {
  TIME_OPTIONS,
  assertOnHeaderCells,
  assertOnTableValues,
  assertOnTimeSeriesFooter,
  openPopoverFromDefaultBucketSize,
} from "../support/binning-time-series";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { summarize, waitForDataset } from "../support/models";
import { rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Test Question",
  query: {
    "source-table": ORDERS_ID,
    limit: 50,
  },
};

test.describe("scenarios > binning > correctness > time series", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await summarize(page);

    await openPopoverFromDefaultBucketSize(page, "Created At", "by month");
  });

  for (const [bucketSize, { selected, isHiddenByDefault, representativeValues }] of Object.entries(
    TIME_OPTIONS,
  )) {
    test(`should return correct values for ${bucketSize}`, async ({ page }) => {
      if (isHiddenByDefault) {
        await popover(page).getByRole("button", { name: "More…" }).click();
      }
      const dataset = waitForDataset(page);
      await popover(page).getByText(bucketSize, { exact: true }).click();
      await dataset;

      const binningButton = await getBinningButtonForDimension(page, {
        name: "Created At",
        isSelected: true,
      });
      await expect(binningButton).toHaveText(selected);

      await rightSidebar(page).getByRole("button", { name: "Done" }).click();

      await expect(
        page.getByText(`Count by Created At: ${bucketSize}`, { exact: true }),
      ).toBeVisible();

      await assertOnHeaderCells(page, bucketSize);
      await assertOnTableValues(page, representativeValues);

      await assertOnTimeSeriesFooter(page, bucketSize);
    });
  }
});
