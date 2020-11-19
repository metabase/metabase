// Imported from drillthroughs.e2e.spec.js
import { restore, signInAsAdmin, withSampleDataset } from "__support__/cypress";

// This question is part of our pre-defined data set used for testing
const Q2 = {
  name: "Orders, Count",
  id: 2,
};

describe("scenarios > visualizations > drillthroughs > dash_drill", () => {
  describe("card title click action", () => {
    describe("from a scalar card", () => {
      const DASHBOARD_NAME = "Scalar Dash";

      before(() => {
        restore();
        signInAsAdmin();

        // Convert the second question to a scalar (Orders, summarized by count)
        cy.request("PUT", `/api/card/${Q2.id}`, {
          display: "scalar",
        });

        addCardToNewDashboard(DASHBOARD_NAME, Q2.id);

        cy.findByText(DASHBOARD_NAME);
        clickCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.log("**Assert that the url is correct**");
        cy.location("pathname").should("eq", `/question/${Q2.id}`);

        cy.contains("18,760");
      });
    });

    describe("from a scalar with active filter applied", () => {
      const DASHBOARD_NAME = "Scalar w Filter Dash";

      before(() => {
        restore();
        signInAsAdmin();

        // Convert Q2 to a scalar with a filter applied
        withSampleDataset(({ ORDERS }) => {
          cy.request("PUT", `/api/card/${Q2.id}`, {
            dataset_query: {
              database: 1,
              query: {
                aggregation: [["count"]],
                filter: [">", ["field-id", ORDERS.TOTAL], 100],
                "source-table": 2,
              },
              type: "query",
            },
            display: "scalar",
          });
        });

        addCardToNewDashboard(DASHBOARD_NAME, Q2.id);

        cy.findByText(DASHBOARD_NAME);
        clickCardTitle(Q2.name);
      });

      it("should result in a correct query result", () => {
        cy.location("pathname").should("eq", `/question/${Q2.id}`);
        cy.findByText("5,995");
      });
    });

    describe("from a dashcard multiscalar legend", () => {
      const DASHBOARD_NAME = "Multiscalar Dash";
      const CARD_NAME = "Multiscalar Question";

      before(() => {
        restore();
        signInAsAdmin();

        // Create muliscalar card
        withSampleDataset(({ PEOPLE, PEOPLE_ID }) => {
          cy.request("POST", "/api/card", {
            name: CARD_NAME,
            dataset_query: {
              database: 1,
              query: {
                "source-table": PEOPLE_ID,
                aggregation: [["count"]],
                breakout: [
                  ["field-id", PEOPLE.SOURCE],
                  ["datetime-field", ["field-id", PEOPLE.CREATED_AT], "month"],
                ],
              },
              type: "query",
            },
            display: "line",
            visualization_settings: {},
          }).then(({ body: { id: CARD_ID } }) => {
            addCardToNewDashboard(DASHBOARD_NAME, CARD_ID);

            cy.findByText(DASHBOARD_NAME);
            cy.findByText(CARD_NAME).click();
          });
        });
      });

      it("should result in a correct query result", () => {
        cy.findByText("Affiliate");
        cy.get(".dot").should("have.length.of.at.least", 100);
      });
    });
  });
});

function clickCardTitle(card_name) {
  cy.get(".Scalar-title")
    .contains(card_name)
    .click();
}

function addCardToNewDashboard(dashboard_name, card_id) {
  // Create a new dashboard
  cy.request("POST", "/api/dashboard", {
    name: dashboard_name,
  }).then(({ body: { id: DASHBOARD_ID } }) => {
    // Add a card to it (with predefined size 6,4 simply for readability)
    cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
      id: DASHBOARD_ID,
      cardId: card_id,
      sizeX: 6,
      sizeY: 4,
    });
    // Visit newly created dashboard
    cy.visit(`/dashboard/${DASHBOARD_ID}`);
  });
}
