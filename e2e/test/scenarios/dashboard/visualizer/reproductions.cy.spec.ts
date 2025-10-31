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

  it("should preserve column settings when use visualizer (metabase#61521)", () => {
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

    H.createQuestion(questionBDetails as unknown as StructuredQuestionDetails);

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.createQuestionAndAddToDashboard(
        questionADetails as unknown as StructuredQuestionDetails,
        dashboardId,
      );

      cy.visit(`/dashboard/${dashboardId}`);
    });

    H.editDashboard();
    H.findDashCardAction(
      H.getDashboardCard(0),
      "Visualize another way",
    ).click();

    H.modal().within(() => {
      H.switchToAddMoreData();

      cy.findByText("Question B for 61521")
        .closest("[data-testid='swap-dataset-button']")
        .should("not.have.attr", "aria-pressed", "true")
        .click({ force: true });

      cy.wait("@cardQuery");

      cy.findByLabelText("Legend")
        .findByText("Question B for 61521")
        .should("exist");

      // ensure there is no additional unformatted axis
      cy.findByText("0.06").should("not.exist");
      cy.findByText("0.05").should("not.exist");
      cy.findByText("0.04").should("not.exist");
    });
  });
});
