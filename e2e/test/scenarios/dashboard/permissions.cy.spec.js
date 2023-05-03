import _ from "underscore";
import { assoc } from "icepick";
import {
  updateDashboardCards,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

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
          database: SAMPLE_DB_ID,
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
          database: SAMPLE_DB_ID,
          type: "native",
          native: { query: "select 'bar'" },
        },
        display: "table",
        visualization_settings: {},
        name: "Second Question",
        collection_id: null,
      }).then(({ body: { id } }) => (secondQuestionId = id));
    });

    cy.createDashboard().then(({ body: { id: dashId } }) => {
      dashboardId = dashId;

      updateDashboardCards({
        dashboard_id: dashId,
        cards: [
          { card_id: firstQuestionId, row: 0, col: 0, size_x: 6, size_y: 6 },
          { card_id: secondQuestionId, row: 0, col: 6, size_x: 6, size_y: 6 },
        ],
      });
    });
  });

  it("should let admins view all cards in a dashboard", () => {
    visitDashboard(dashboardId);
    // Admin can see both questions
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("First Question");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second Question");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("bar");
  });

  it("should display dashboards with some cards locked down", () => {
    cy.signIn("nodata");
    visitDashboard(dashboardId);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second Question");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("bar");
  });

  it("should display an error if they don't have perms for the dashboard", () => {
    cy.signIn("nocollection");
    visitDashboard(dashboardId);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don’t have permission to see that.");
  });
});
