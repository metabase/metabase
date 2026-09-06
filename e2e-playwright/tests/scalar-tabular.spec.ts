/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/scalar.cy.spec.js
 *
 * Scalar (single big number) viz: compact/human-readable notation across
 * screen sizes, and date-without-time rendering + viz settings visibility.
 *
 * Notes:
 * - The "human readable numbers" test is a viewport loop; `mobile` is skipped
 *   upstream (cy.skipOn) so it is `test.skip`ed here.
 * - The date test is date-asserting (a Z timestamp cast to date renders a day
 *   earlier under US/Pacific) — run with TZ=US/Pacific to match CI.
 * - Upstream's `cy.findByText(...)` are unscoped exact matches (rule 1).
 */
import { openVizSettingsSidebar } from "../support/charts";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SCREEN_SIZES: Record<string, [number, number]> = {
  mobile: [600, 400],
  tablet: [900, 600],
  desktop: [1200, 800],
  hd: [1920, 1280],
};

test.describe("scenarios > visualizations > scalar", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  for (const [size, viewport] of Object.entries(SCREEN_SIZES)) {
    // Preserve the upstream (truncated) title verbatim, incl. the "(metabase".
    test(`should render human readable numbers on ${size} screen size (metabase`, async ({
      page,
      mb,
    }) => {
      // Upstream cy.skipOn(size === "mobile").
      test.skip(size === "mobile", "skipped upstream on mobile");

      const [width, height] = viewport;
      await page.setViewportSize({ width, height });

      const { dashboardId } = await mb.api.createQuestionAndDashboard({
        questionDetails: {
          name: "12629",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["*", 1000000, ["sum", ["field", ORDERS.TOTAL, null]]],
            ],
          },
          display: "scalar",
        },
        cardDetails: {
          size_x: 5,
          size_y: 4,
        },
      });

      await visitDashboard(page, mb.api, dashboardId);
      await expect(page.getByText("1.5T", { exact: true })).toBeVisible();
    });
  }

  test("should render date without time (metabase#7494)", async ({ page }) => {
    await visitNativeQuestionAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT cast('2024-05-01T00:00:00Z'::timestamp as date)",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "scalar",
    });

    await expect(
      page.getByText("April 30, 2024", { exact: true }),
    ).toBeVisible();

    await openVizSettingsSidebar(page);

    await expect(page.getByText("Show the time", { exact: true })).toBeHidden();
    await expect(page.getByText("Time style", { exact: true })).toBeHidden();
  });
});
