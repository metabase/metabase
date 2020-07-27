import {
  signInAsAdmin,
  signIn,
  withSampleDataset,
  restore,
} from "__support__/cypress";

describe("scenarios > dashboard > permissions", () => {
  before(restore);
  let dashboardId;

  it("should let admins view all cards in a dashboard", () => {
    // This first test creates a dashboard with two questions.
    // One is in Our Analytics the other is in a more locked down collection.
    signInAsAdmin();

    // The setup is a bunch of nested API calls to create the questions, dashboard, dashcards, collections and link them all up together.
    let firstQuestionId, secondQuestionId;
    withSampleDataset(({ ORDERS_ID }) => {
      cy.request("POST", "/api/collection", {
        name: "locked down collection",
        color: "#509EE3",
        parent_id: null,
      }).then(({ body: { id: collection_id } }) => {
        // TODO - This will break if the default snapshot updates collections or groups.
        // We should first request the current graph and then modify it.
        cy.request("PUT", "/api/collection/graph", {
          revision: 1,
          groups: {
            "1": { "6": "none", root: "none" },
            "2": { "6": "write", root: "write" },
            "3": { "6": "write", root: "write" },
            "4": { "6": "none", root: "write" },
            "5": { "6": "none", root: "none" },
          },
        });
        cy.request("POST", "/api/card", {
          dataset_query: {
            database: 1,
            type: "native",
            native: { query: "select 'foo'" },
          },
          display: "table",
          visualization_settings: {},
          name: "First Question",
          collection_id,
        }).then(({ body: { id } }) => (firstQuestionId = id));
      });
      cy.request("POST", "/api/card", {
        dataset_query: {
          database: 1,
          type: "native",
          native: { query: "select 'bar'" },
        },
        display: "table",
        visualization_settings: {},
        name: "Second Question",
        collection_id: null,
      }).then(({ body: { id } }) => (secondQuestionId = id));
    });

    cy.request("POST", "/api/dashboard", { name: "dashboard" }).then(
      ({ body: { id: dashId } }) => {
        cy.request("POST", `/api/dashboard/${dashId}/cards`, {
          cardId: firstQuestionId,
        }).then(({ body: { id: dashCardIdA } }) => {
          cy.request("POST", `/api/dashboard/${dashId}/cards`, {
            cardId: secondQuestionId,
          }).then(({ body: { id: dashCardIdB } }) => {
            cy.request("PUT", `/api/dashboard/${dashId}/cards`, {
              cards: [
                {
                  id: dashCardIdA,
                  card_id: firstQuestionId,
                  row: 0,
                  col: 0,
                  sizeX: 6,
                  sizeY: 6,
                },
                {
                  id: dashCardIdB,
                  card_id: secondQuestionId,
                  row: 0,
                  col: 6,
                  sizeX: 6,
                  sizeY: 6,
                },
              ],
            });
          });
        });
        dashboardId = dashId;
        cy.visit(`/dashboard/${dashId}`);
      },
    );

    // Admin can see both questions
    cy.findByText("First Question");
    cy.findByText("foo");
    cy.findByText("Second Question");
    cy.findByText("bar");
  });

  it("should display dashboards with some cards locked down", () => {
    signIn("nodata");
    cy.visit(`/dashboard/${dashboardId}`);
    cy.findByText("Sorry, you don't have permission to see this card.");
    cy.findByText("Second Question");
    cy.findByText("bar");
  });

  it("should display an error if they don't have perms for the dashboard", () => {
    signIn("nocollection");
    cy.visit(`/dashboard/${dashboardId}`);
    cy.findByText("Sorry, you don’t have permission to see that.");
  });
});
