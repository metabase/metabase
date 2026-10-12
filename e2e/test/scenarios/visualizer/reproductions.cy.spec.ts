import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 61521", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should preserve percent formatting of an added series (metabase#61521)", () => {
    const questionADetails = {
      name: "Question A for 61521",
      display: "line" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            [
              "/",
              [
                "sum",
                [
                  "field" as const,
                  ORDERS.TAX,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              [
                "sum",
                [
                  "field" as const,
                  ORDERS.SUBTOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
            ],
            {
              name: "Tax over Sub",
              "display-name": "Tax over Sub",
            },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
        ],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["Tax over Sub"],
        column_settings: {
          '["name","Tax over Sub"]': { number_style: "percent" },
        },
      },
    };

    const questionBDetails = {
      name: "Question B for 61521",
      display: "line" as const,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            [
              "/",
              [
                "sum",
                [
                  "field",
                  ORDERS.TAX,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              [
                "sum",
                [
                  "field",
                  ORDERS.TOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
            ],
            {
              name: "Tax over Total",
              "display-name": "Tax over Total",
            },
          ],
        ],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
        ],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["Tax over Total"],
        column_settings: {
          '["name","Tax over Total"]': { number_style: "percent" },
        },
      },
    };

    // Unjustified type cast. FIXME
    H.createQuestion(questionBDetails as unknown as StructuredQuestionDetails);

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.createQuestionAndAddToDashboard(
        // Unjustified type cast. FIXME
        questionADetails as unknown as StructuredQuestionDetails,
        dashboardId,
      );

      cy.visit(`/dashboard/${dashboardId}`);
    });

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset("Question B for 61521");

      cy.findByLabelText("Legend")
        .findByText("Question B for 61521")
        .should("exist");

      H.cartesianChartCircleWithColor("#88BF4D").eq(5).realHover();
    });
    // The value must be a percentage; the period comparison is signed
    H.assertEChartsTooltip({
      rows: [{ name: "Question B for 61521", value: /^\d+(\.\d+)?%$/ }],
    });

    H.modal().within(() => {
      // ensure there is no additional unformatted axis
      cy.findByText("0.06").should("not.exist");
      cy.findByText("0.05").should("not.exist");
      cy.findByText("0.04").should("not.exist");
    });
  });
});
