// Imported from drillthroughs.e2e.spec.js
import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

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
            database: 1,
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
              // Prepare to wait for this specific XHR:
              // We need to do this because Cypress sees the string that is "card title" before card is fully rendered.
              // That string then gets detached from DOM just prior to this XHR and gets re-rendered again inside a new DOM element.
              // Cypress was complaining it cannot click on a detached element.
              cy.server();
              cy.route(
                "POST",
                `/api/dashboard/${DASHBOARD_ID}/card/${CARD_ID}/query`,
              ).as("cardQuery");

              // Add previously created question to the new dashboard
              cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cardId: CARD_ID,
                sizeX: 16,
                sizeY: 12,
              });

              cy.visit(`/dashboard/${DASHBOARD_ID}`);
              cy.findByText(DASHBOARD_NAME);

              cy.wait("@cardQuery"); // wait for the title to be re-rendered before we can click on it
              cy.findByText(CARD_NAME).click();
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
                    sizeX: 10,
                    sizeY: 8,
                    parameter_mappings: [
                      {
                        parameter_id: "91bace6e",
                        card_id: QUESTION_ID,
                        target: [
                          "dimension",
                          ["field", PRODUCTS.CATEGORY, null],
                        ],
                      },
                    ],
                  },
                ],
              });
            });
            cy.server();
            cy.route(
              "POST",
              `/api/dashboard/${DASHBOARD_ID}/card/${QUESTION_ID}/query`,
            ).as("cardQuery");
            cy.route("POST", `/api/dataset`).as("dataset");

            cy.visit(`/dashboard/${DASHBOARD_ID}`);

            cy.wait("@cardQuery");
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
  cy.get(".Scalar-title")
    .contains(card_name)
    .click();
}

function addCardToNewDashboard(dashboard_name, card_id) {
  cy.createDashboard({ name: dashboard_name }).then(
    ({ body: { id: DASHBOARD_ID } }) => {
      // Add a card to it (with predefined size 6,4 simply for readability)
      cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
        cardId: card_id,
        sizeX: 6,
        sizeY: 4,
      });
      // Visit newly created dashboard
      cy.visit(`/dashboard/${DASHBOARD_ID}`);
    },
  );
}
