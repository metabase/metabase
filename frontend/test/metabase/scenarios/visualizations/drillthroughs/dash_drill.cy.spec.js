// Imported from drillthroughs.e2e.spec.js
import { restore, visitDashboard } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// This question is part of our pre-defined data set used for testing
const Q2 = {
  name: "Orders, Count",
  id: 2,
  expectedPath: "2-orders-count",
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

        cy.findByText(DASHBOARD_NAME);
        clickScalarCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.log("Assert that the url is correct");
        cy.location("pathname").should("eq", `/question/${Q2.expectedPath}`);

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

        cy.findByText(DASHBOARD_NAME);
        clickScalarCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.location("pathname").should("eq", `/question/${Q2.expectedPath}`);
        cy.findByText("5,755");
      });
    });

    describe("from a dashcard multiscalar legend", () => {
      const DASHBOARD_NAME = "Multiscalar Dash";
      const CARD_NAME = "Multiscalar Question";

      beforeEach(() => {
        // Create muliscalar card
        cy.createQuestion({
          name: CARD_NAME,
          query: {
            "source-table": PEOPLE_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PEOPLE.SOURCE, null],
              ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          display: "line",
        }).then(({ body: { id: CARD_ID } }) => {
          cy.createDashboard({ name: DASHBOARD_NAME }).then(
            ({ body: { id: DASHBOARD_ID } }) => {
              // Add previously created question to the new dashboard
              cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cardId: CARD_ID,
                size_x: 16,
                size_y: 12,
              });

              visitDashboard(DASHBOARD_ID);
              cy.findByText(DASHBOARD_NAME);

              cy.intercept("POST", `/api/card/${CARD_ID}/query`).as(
                "cardQuery",
              );

              cy.findByText(CARD_NAME).click();
              cy.wait("@cardQuery");
            },
          );
        });
      });

      it("should result in a correct query result", () => {
        cy.findByText("Affiliate");
        cy.get(".dot").should("have.length.of.at.least", 100);
      });
    });

    describe("saved visualizations", () => {
      it("should respect visualization type when entering a question from a dashboard (metabase#13415)", () => {
        const QUESTION_NAME = "13415";

        cy.createQuestion({
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
        }).then(({ body: { id: QUESTION_ID } }) => {
          cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add filter with the default value to the dashboard");

            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
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

            cy.log("Add previously created question to the dashboard");

            cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cardId: QUESTION_ID,
            }).then(({ body: { id: DASH_CARD_ID } }) => {
              cy.log("Connect filter to that question");

              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cards: [
                  {
                    id: DASH_CARD_ID,
                    card_id: QUESTION_ID,
                    row: 0,
                    col: 0,
                    size_x: 10,
                    size_y: 8,
                    parameter_mappings: [
                      {
                        parameter_id: "91bace6e",
                        card_id: QUESTION_ID,
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
                ],
              });
            });

            cy.intercept("POST", "/api/dataset").as("dataset");

            visitDashboard(DASHBOARD_ID);

            cy.findByText(QUESTION_NAME).click();

            cy.wait("@dataset");
            cy.findByText("Category is Doohickey");
            cy.findByText("177"); // Doohickeys for 2016
          });
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
    ({ body: { id: DASHBOARD_ID } }) => {
      // Add a card to it (with predefined size 6,4 simply for readability)
      cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
        cardId: card_id,
        size_x: 6,
        size_y: 4,
      });
      // Visit newly created dashboard
      visitDashboard(DASHBOARD_ID);
    },
  );
}
