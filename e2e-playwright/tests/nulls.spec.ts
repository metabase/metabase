/**
 * Playwright port of e2e/test/scenarios/question/nulls.cy.spec.js
 *
 * Null-value handling across the QB: null display in the object detail, pie /
 * scalar cards over null values, filtering on an empty (null) cell, and a
 * cumulative-sum aggregation over a column with nulls.
 *
 * Porting notes:
 * - Shared helpers imported read-only: create* (factories),
 *   addOrUpdateDashboardCard (dashboard-management), updateDashboardCards
 *   (dashboard-core), visitDashboard / popover / icon (ui), openObjectDetail
 *   (viz-charts-repros), openOrdersTable (question-settings), summarize
 *   (models), rightSidebar (question-saved), cartesianChartCircles (metrics),
 *   findByDisplayValue (filters-repros).
 * - New helpers (findGridcell / nextCell) live in support/nulls.ts.
 * - `cy.findByDisplayValue("13626D")` (dashboard title EditableText, a
 *   <textarea>) → the retrying `toHaveValue` on the dashboard-name-heading.
 * - `cy.contains(str)` is case-sensitive substring, first match → getByText
 *   with a caseSensitiveSubstring regex + .first().
 * - `cartesianChartCircle` count assertion → expect.poll(count) so it retries
 *   while the chart renders.
 */
import { echartsContainer } from "../support/charts";
import {
  createDashboard,
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { updateDashboardCards } from "../support/dashboard-core";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { cartesianChartCircles } from "../support/metrics";
import { summarize } from "../support/models";
import { findGridcell, nextCell } from "../support/nulls";
import { rightSidebar } from "../support/question-saved";
import { openOrdersTable } from "../support/question-settings";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { icon, popover, visitDashboard } from "../support/ui";
import { openObjectDetail } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > null", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display rows whose value is `null` (metabase#13571)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, {
      name: "13571",
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.DISCOUNT, null],
        ],
        filter: ["=", ["field", ORDERS.ID, null], 1],
      },
    });

    // find and open previously created question
    await page.goto("/collection/root");
    await page.getByText("13571", { exact: true }).click();

    // "No Results" since at least v0.34.3
    await openObjectDetail(page, 0);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Discount/i)).toBeVisible();
    await expect(dialog.getByText("empty", { exact: true })).toBeVisible();
  });

  test("pie chart should handle `0`/`null` values (metabase#13626)", async ({
    page,
    mb,
  }) => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13626
    const { questionId: card_id, dashboardId: dashboard_id } =
      await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "13626",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["expression", "NewDiscount"]]],
            breakout: [["field", ORDERS.ID, null]],
            expressions: {
              NewDiscount: [
                "case",
                [[["=", ["field", ORDERS.ID, null], 2], 0]],
                { default: ["field", ORDERS.DISCOUNT, null] },
              ],
            },
            filter: ["=", ["field", ORDERS.ID, null], 1, 2, 3],
          },
          display: "pie",
        },
        dashboardDetails: {
          name: "13626D",
          parameters: [
            {
              id: "1f97c149",
              name: "ID",
              slug: "id",
              type: "id",
            },
          ],
        },
      });

    await addOrUpdateDashboardCard(mb.api, {
      card_id,
      dashboard_id,
      card: {
        size_x: 12,
        size_y: 8,
        parameter_mappings: [
          {
            parameter_id: "1f97c149",
            card_id,
            target: ["dimension", ["field", ORDERS.ID, null]],
          },
        ],
      },
    });

    // NOTE: The actual "Assertion" phase begins here
    await page.goto(`/dashboard/${dashboard_id}?id=1`);
    await expect(page.getByTestId("dashboard-name-heading")).toHaveValue(
      "13626D",
    );

    // Reported failing in v0.37.0.2
    const container = page.getByTestId("dashcard-container");
    await expect(container.getByTestId("loading-indicator")).toHaveCount(0);
    await expect(container.getByTestId("legend-caption-title")).toHaveText(
      "13626",
    );
    await expect(container.getByText("Total", { exact: true })).toBeVisible();
    await expect(container.getByText("0", { exact: true })).toBeVisible();
  });

  test("dashboard should handle cards with null values (metabase#13801)", async ({
    page,
    mb,
  }) => {
    const { id: Q1_ID } = await createNativeQuestion(mb.api, {
      name: "13801_Q1",
      native: { query: "SELECT null", "template-tags": {} },
      display: "scalar",
    });
    const { id: Q2_ID } = await createNativeQuestion(mb.api, {
      name: "13801_Q2",
      native: { query: "SELECT 0", "template-tags": {} },
      display: "scalar",
    });
    const { id: DASHBOARD_ID } = await createDashboard(mb.api);

    // Add both previously created questions to the dashboard
    await updateDashboardCards(mb.api, {
      dashboard_id: DASHBOARD_ID,
      cards: [
        { card_id: Q1_ID, row: 0, col: 0, size_x: 8, size_y: 4 },
        { card_id: Q2_ID, row: 0, col: 6, size_x: 8, size_y: 4 },
      ],
    });

    await visitDashboard(page, mb.api, DASHBOARD_ID);
    // P0 regression in v0.37.1!
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    await expect(page.getByText("13801_Q1", { exact: true })).toBeVisible();
    await expect(
      page.getByTestId("scalar-value").filter({ hasText: "0" }).first(),
    ).toBeVisible();
    await expect(page.getByText("13801_Q2", { exact: true })).toBeVisible();
  });

  test("should filter by clicking on the row with `null` value (metabase#18386)", async ({
    page,
  }) => {
    await openOrdersTable(page);

    // Total of "39.72", and the next cell is the `discount` (which is empty)
    const discountCell = nextCell(findGridcell(page, "39.72"))
      .locator("div")
      .first();
    await expect(discountCell).toHaveText("");
    // Open the context menu that lets us apply filter using this column directly
    await discountCell.click({ force: true });

    await popover(page).getByText("=").first().click();

    await expect(findGridcell(page, "39.72")).toBeVisible();
    // This row ([id] 3) had the `discount` column value and should be filtered out now
    await expect(findGridcell(page, "49.21")).toHaveCount(0);
  });

  test.describe("aggregations with null values", () => {
    test("summarize with null values (metabase#12585)", async ({ page }) => {
      await openOrdersTable(page);

      await summarize(page);
      // remove pre-selected "Count"
      await icon(rightSidebar(page), "close").click();
      await page
        .getByText("Add a function or metric", { exact: true })
        .click();
      // dropdown immediately opens with the new set of metrics to choose from
      await popover(page)
        .getByText("Cumulative sum of ...", { exact: true })
        .click();
      await popover(page).getByText("Discount", { exact: true }).click();
      // Group by
      await page
        .getByText(caseSensitiveSubstring("Created At"))
        .first()
        .click();
      await expect(
        page
          .getByText(
            caseSensitiveSubstring("Cumulative sum of Discount by Created At: Month"),
          )
          .first(),
      ).toBeVisible();

      await expect(
        page.getByText("There was a problem with your question", {
          exact: true,
        }),
      ).toHaveCount(0);

      await expect(echartsContainer(page)).toBeVisible();
      await expect
        .poll(() => cartesianChartCircles(page).count())
        .toBeGreaterThanOrEqual(40);
    });
  });
});
