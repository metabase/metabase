import {
  addOrUpdateDashboardCard,
  queryBuilderMain,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// This question is part of our pre-defined data set used for testing
const Q2 = {
  name: "Orders, Count",
  id: ORDERS_COUNT_QUESTION_ID,
  expectedPath: `${ORDERS_COUNT_QUESTION_ID}-orders-count`,
};

describe("scenarios > visualizations > drillthroughs > dash_drill", () => {
  describe("card title click action", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });
    describe("from a scalar card", () => {
      const DASHBOARD_NAME = "Scalar Dash";

      beforeEach(() => {
        // Convert the second question to a scalar (Orders, summarized by count)
        cy.request("PUT", `/api/card/${Q2.id}`, {
          display: "scalar",
        });

        addCardToNewDashboard(DASHBOARD_NAME, Q2.id);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(DASHBOARD_NAME);
        clickScalarCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.log("Assert that the url is correct");
        cy.location("pathname").should("eq", `/question/${Q2.expectedPath}`);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("18,760");
      });
    });

    describe("from a scalar with active filter applied", () => {
      const DASHBOARD_NAME = "Scalar w Filter Dash";

      beforeEach(() => {
        // Convert Q2 to a scalar with a filter applied
        cy.request("PUT", `/api/card/${Q2.id}`, {
          dataset_query: {
            database: SAMPLE_DB_ID,
            query: {
              aggregation: [["count"]],
              filter: [">", ["field", ORDERS.TOTAL, null], 100],
              "source-table": ORDERS_ID,
            },
            type: "query",
          },
          display: "scalar",
        });

        addCardToNewDashboard(DASHBOARD_NAME, Q2.id);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(DASHBOARD_NAME);
        clickScalarCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.location("pathname").should("eq", `/question/${Q2.expectedPath}`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("5,755");
      });
    });

    describe("from a dashcard multiscalar legend", () => {
      const DASHBOARD_NAME = "Multiscalar Dash";
      const CARD_NAME = "Multiscalar Question";

      beforeEach(() => {
        cy.createQuestionAndDashboard({
          questionDetails: {
            name: CARD_NAME,
            // Create muliscalar card
            query: {
              "source-table": PEOPLE_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", PEOPLE.SOURCE, null],
                ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
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
        }).then(({ body: { dashboard_id, card_id } }) => {
          visitDashboard(dashboard_id);
          cy.findByText(DASHBOARD_NAME);

          cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");

          cy.findByText(CARD_NAME).click();
          cy.wait("@cardQuery");
        });
      });

      it("should result in a correct query result", () => {
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Affiliate");
        cy.get(".dot").should("have.length.of.at.least", 100);
      });
    });

    describe("saved visualizations", () => {
      it("should respect visualization type when entering a question from a dashboard (metabase#13415)", () => {
        const QUESTION_NAME = "13415";

        cy.createQuestionAndDashboard({
          questionDetails: {
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
          },
          dashboardDetails: {
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
          },
        }).then(({ body: { dashboard_id, card_id } }) => {
          // Adding filter parameter mapping to dashcard
          addOrUpdateDashboardCard({
            card_id,
            dashboard_id,
            card: {
              parameter_mappings: [
                {
                  parameter_id: "91bace6e",
                  card_id: card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      { "source-field": ORDERS.PRODUCT_ID },
                    ],
                  ],
                },
              ],
            },
          });

          visitDashboard(dashboard_id);
          cy.findByTestId("dashcard").findByText(QUESTION_NAME).click();
          cy.findByTestId("qb-filters-panel")
            .findByText("Product → Category is Doohickey")
            .should("be.visible");
          queryBuilderMain().findByText("177").should("be.visible"); // Doohickeys for 2022
        });
      });
    });
  });
});

// This class shows up only when card title is already re-rendered.
// That's why we don't have to wait for a specific XHR, but this works only for SCALAR questions.
function clickScalarCardTitle(card_name) {
  cy.findByTestId("scalar-title").contains(card_name).click();
}

function addCardToNewDashboard(dashboard_name, card_id) {
  cy.createDashboard({ name: dashboard_name }).then(
    ({ body: { id: dashboard_id } }) => {
      addOrUpdateDashboardCard({ card_id, dashboard_id });
      visitDashboard(dashboard_id);
    },
  );
}
