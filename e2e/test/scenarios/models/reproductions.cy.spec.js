import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, filter, createQuestion } from "e2e/support/helpers";

import { turnIntoModel } from "./helpers/e2e-models-helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("cumulative count - issue 33330", () => {
  const questionDetails = {
    name: "33330",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after turning a question into model (metabase#33330-1)", () => {
    turnIntoModel();
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data").should("contain", "June 2022");
  });

  it("should still work after applying a post-aggregation filter (metabase#33330-2)", () => {
    filter();
    cy.findByRole("dialog").within(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTestId("filter-column-Created At").findByText("Today").click();
      cy.button("Apply filters").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("filter-pill").should("have.text", "Created At is today");
    cy.findAllByTestId("header-cell")
      .should("contain", "Created At: Month")
      .and("contain", "Cumulative count");
    cy.findAllByTestId("cell-data")
      .should("have.length", "4")
      .and("not.be.empty");
    cy.findByTestId("question-row-count").should("have.text", "Showing 1 row");
  });
});
