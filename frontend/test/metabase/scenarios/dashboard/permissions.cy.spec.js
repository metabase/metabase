import _ from "underscore";
import { assoc } from "icepick";
import { restore } from "__support__/e2e/cypress";

describe("scenarios > dashboard > permissions", () => {
  let dashboardId;

  beforeEach(() => {
    restore();
    // This first test creates a dashboard with two questions.
    // One is in Our Analytics the other is in a more locked down collection.
    cy.signInAsAdmin();

    // The setup is a bunch of nested API calls to create the questions, dashboard, dashcards, collections and link them all up together.
    let firstQuestionId, secondQuestionId;

    cy.request("POST", "/api/collection", {
      name: "locked down collection",
      color: "#509EE3",
      parent_id: null,
    }).then(({ body: { id: collection_id } }) => {
      cy.request("GET", "/api/collection/graph").then(
        ({ body: { revision, groups } }) => {
          // update the perms for the just-created collection
          cy.request("PUT", "/api/collection/graph", {
            revision,
            groups: _.mapObject(groups, (groupPerms, groupId) =>
              assoc(
                groupPerms,
                collection_id,
                // 2 is admins, so leave that as "write"
                groupId === "2" ? "write" : "none",
              ),
            ),
          });
        },
      );

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

    cy.createDashboard("dashboard").then(({ body: { id: dashId } }) => {
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
    });
  });

  it("should let admins view all cards in a dashboard", () => {
    // Admin can see both questions
    cy.findByText("First Question");
    cy.findByText("foo");
    cy.findByText("Second Question");
    cy.findByText("bar");
  });

  it("should display dashboards with some cards locked down", () => {
    cy.signIn("nodata");
    cy.visit(`/dashboard/${dashboardId}`);
    cy.findByText("Sorry, you don't have permission to see this card.");
    cy.findByText("Second Question");
    cy.findByText("bar");
  });

  it("should display an error if they don't have perms for the dashboard", () => {
    cy.signIn("nocollection");
    cy.visit(`/dashboard/${dashboardId}`);
    cy.findByText("Sorry, you don’t have permission to see that.");
  });
});
