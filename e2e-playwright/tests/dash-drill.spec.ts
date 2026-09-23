/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/drillthroughs/dash_drill.cy.spec.js
 */
import {
  addCardToNewDashboard,
  addOrUpdateDashboardCard,
  clickScalarCardTitle,
  createDashboardWithDetails,
} from "../support/drillthroughs";
import { test, expect } from "../support/fixtures";
import { cartesianChartCircles } from "../support/metrics";
import { queryBuilderMain } from "../support/notebook";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// This question is part of our pre-defined data set used for testing
const Q2 = {
  name: "Orders, Count",
  id: ORDERS_COUNT_QUESTION_ID,
  expectedPath: `${ORDERS_COUNT_QUESTION_ID}-orders-count`,
};

test.describe("scenarios > visualizations > drillthroughs > dash_drill", () => {
  test.describe("card title click action", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test.describe("from a scalar card", () => {
      const DASHBOARD_NAME = "Scalar Dash";

      test("should result in a correct query result", async ({ page, mb }) => {
        // Convert the second question to a scalar (Orders, summarized by count)
        await mb.api.put(`/api/card/${Q2.id}`, { display: "scalar" });

        await addCardToNewDashboard(page, mb.api, DASHBOARD_NAME, Q2.id);
        await expect(
          page.getByText(DASHBOARD_NAME, { exact: true }),
        ).toBeVisible();
        await clickScalarCardTitle(page, Q2.name);

        // Assert that the url is correct
        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(`/question/${Q2.expectedPath}`);

        await expect(page.getByText(/18,760/)).toBeVisible();
      });
    });

    test.describe("from a scalar with active filter applied", () => {
      const DASHBOARD_NAME = "Scalar w Filter Dash";

      test("should result in a correct query result", async ({ page, mb }) => {
        // Convert Q2 to a scalar with a filter applied
        await mb.api.put(`/api/card/${Q2.id}`, {
          dataset_query: {
            database: SAMPLE_DB_ID,
            query: {
              aggregation: [["count"]],
              filter: [
                ">",
                ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
                100,
              ],
              "source-table": ORDERS_ID,
            },
            type: "query",
          },
          display: "scalar",
        });

        await addCardToNewDashboard(page, mb.api, DASHBOARD_NAME, Q2.id);
        await expect(
          page.getByText(DASHBOARD_NAME, { exact: true }),
        ).toBeVisible();
        await clickScalarCardTitle(page, Q2.name);

        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(`/question/${Q2.expectedPath}`);
        await expect(page.getByText("5,755", { exact: true })).toBeVisible();
      });
    });

    test.describe("from a dashcard multiscalar legend", () => {
      const DASHBOARD_NAME = "Multiscalar Dash";
      const CARD_NAME = "Multiscalar Question";

      test("should result in a correct query result", async ({ page, mb }) => {
        const { questionId, dashboardId } =
          await mb.api.createQuestionAndDashboard({
            questionDetails: {
              name: CARD_NAME,
              // Create muliscalar card
              query: {
                "source-table": PEOPLE_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field", PEOPLE.SOURCE, { "base-type": "type/Text" }],
                  [
                    "field",
                    PEOPLE.CREATED_AT,
                    { "base-type": "type/DateTime", "temporal-unit": "month" },
                  ],
                ],
              },
              display: "line",
            },
            dashboardDetails: {
              name: DASHBOARD_NAME,
            },
            cardDetails: {
              size_x: 21,
              size_y: 12,
            },
          });

        await visitDashboard(page, mb.api, dashboardId);
        await expect(
          page.getByText(DASHBOARD_NAME, { exact: true }),
        ).toBeVisible();

        const cardQuery = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname ===
              `/api/card/${questionId}/query`,
        );
        await page.getByText(CARD_NAME, { exact: true }).click();
        await cardQuery;

        await expect(
          queryBuilderMain(page).getByText("Affiliate", { exact: true }),
        ).toBeVisible();
        await expect
          .poll(() => cartesianChartCircles(page).count())
          .toBeGreaterThanOrEqual(100);
      });
    });

    test.describe("saved visualizations", () => {
      test("should respect visualization type when entering a question from a dashboard (metabase#13415)", async ({
        page,
        mb,
      }) => {
        const QUESTION_NAME = "13415";

        const { id: cardId } = await mb.api.createQuestion({
          name: QUESTION_NAME,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
          },
        });
        const { id: dashboardId } = await createDashboardWithDetails(mb.api, {
          // Add filter with the default value to the dashboard
          parameters: [
            {
              id: "91bace6e",
              name: "Category",
              slug: "category",
              type: "category",
              default: ["Doohickey"],
            },
          ],
        });
        // Adding filter parameter mapping to dashcard
        await addOrUpdateDashboardCard(mb.api, {
          card_id: cardId,
          dashboard_id: dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: "91bace6e",
                card_id: cardId,
                target: [
                  "dimension",
                  [
                    "field",
                    PRODUCTS.CATEGORY,
                    { "source-field": ORDERS.PRODUCT_ID },
                  ],
                  { "stage-number": 0 },
                ],
              },
            ],
          },
        });

        await visitDashboard(page, mb.api, dashboardId);
        await page
          .getByTestId("dashcard")
          .getByText(QUESTION_NAME, { exact: true })
          .click();
        await expect(
          page
            .getByTestId("qb-filters-panel")
            .getByText("Product → Category is Doohickey", { exact: true }),
        ).toBeVisible();
        // Doohickeys for 2025
        await expect(
          queryBuilderMain(page).getByText("177", { exact: true }),
        ).toBeVisible();
      });
    });
  });
});
