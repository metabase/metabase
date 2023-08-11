import { restore, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const baseQuestion = {
  name: "Base question",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
  display: "bar",
};

const incompleteQuestion = {
  name: "Incomplete question",
  native: {
    query: "select 1;",
  },
  visualization_settings: {
    "graph.dimensions": [null],
    "graph.metrics": ["1"],
  },
  display: "bar",
};

describe("issue 32231", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card/*/series").as("seriesQuery");

    cy.createNativeQuestion(incompleteQuestion);
    cy.createQuestionAndDashboard({ questionDetails: baseQuestion }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("should show user-friendly error when combining series that cannot be visualized together (metabase#32231)", () => {
    cy.icon("pencil").click();
    cy.findByTestId("add-series-button").click({ force: true });

    cy.get(".AddSeriesModal").within(() => {
      cy.get(".LineAreaBarChart").should("exist");
      cy.findByText("Unable to combine these questions").should("not.exist");

      cy.findByText(incompleteQuestion.name).click();

      cy.get(".LineAreaBarChart").should("not.exist");
      cy.findByText("Unable to combine these questions").should("exist");

      cy.findByText(incompleteQuestion.name).click();

      cy.get(".LineAreaBarChart").should("exist");
      cy.findByText("Unable to combine these questions").should("not.exist");
    });
  });
});
