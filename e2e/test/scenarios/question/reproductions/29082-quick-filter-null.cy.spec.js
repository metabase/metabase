import { popover, restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "22788",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      filter: ["=", ["field", ORDERS.USER_ID, null], 1],
    },
  },
};

describe("issue 29082", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should handle nulls in quick filters (metabase#29082)", () => {
    visitQuestionAdhoc(questionDetails);
    cy.wait("@dataset");
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".TableInteractive-emptyCell").first().click();
    popover().within(() => cy.findByText("=").click());
    cy.wait("@dataset");
    cy.findByText("Showing 8 rows").should("exist");
    cy.findByText("Discount is empty").should("exist");

    cy.findByText("Discount is empty").icon("close").click();
    cy.wait("@dataset");
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".TableInteractive-emptyCell").first().click();
    popover().within(() => cy.findByText("≠").click());
    cy.wait("@dataset");
    cy.findByText("Showing 3 rows").should("exist");
    cy.findByText("Discount is not empty").should("exist");
  });
});
