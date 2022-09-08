import {
  restore,
  modal,
  popover,
  visualize,
  openOrdersTable,
} from "__support__/e2e/helpers";

import { turnIntoModel } from "./helpers/e2e-models-helpers";

describe("scenarios > models with aggregation and breakout", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be possible to convert a question with an aggregation and breakout into a model", () => {
    openOrdersTable({ mode: "notebook" });

    // Add an aggregation
    cy.findByText("Summarize").click();
    cy.findByText("Number of distinct values of ...").click();
    cy.findByText("Product ID").click();

    // Add a breakout
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText("Created At").click();
    });

    // Run question & save
    visualize();
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });
    cy.findByText("Not now").click();

    // Convert the question into a model
    turnIntoModel();
    cy.wait("@updateCard");

    cy.findByText("Created At: Month");
    cy.findByText("Distinct values of Product ID");
  });
});
