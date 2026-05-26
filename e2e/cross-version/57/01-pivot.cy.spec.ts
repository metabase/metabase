import { Q1_NAME } from "../constants";

import * as X from "./helpers";

const { H } = cy;

describe("Cross-version questions - pivot", () => {
  it("setup: creates a pivot table", { tags: ["@source"] }, () => {
    H.restoreCrossVersionDev("00-complete");
    cy.signIn("admin", { skipCache: true });

    cy.log("-- Create a pivot table --");
    // Intentionally start from the root collection to prevent ambiguity
    // in the collection picker when we attempt to save the question
    cy.visit("/collection/root");
    H.newButton("Question").click();
    H.modal().contains("People").should("be.visible").click();

    cy.log(
      "-- Add filter: Narrow down the states that start with K (only two) --",
    );
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    X.selectFromPopover("State");
    cy.findByLabelText("Filter operator").click();
    X.selectFromPopover("Starts with");
    cy.findByLabelText("Filter value").type("K").blur();
    cy.button("Add filter").click();

    cy.log("-- Add aggregation --");
    H.addSummaryField({ metric: "Count of rows" });

    cy.log("-- Add breakouts --");
    H.addSummaryGroupingField({ field: "State" });
    H.addSummaryGroupingField({ field: "Source" });
    H.addSummaryGroupingField({ field: "Created At" });

    H.visualize();

    cy.log("-- Render as pivot table --");
    cy.intercept("POST", "/api/dataset/pivot").as("pivot");
    H.openVizTypeSidebar();
    H.vizTypeSidebar().within(() => {
      cy.findAllByRole("option").filter(":contains(Pivot Table)").click();
      cy.wait("@pivot");
      cy.button("Done").click();
    });

    H.vizTypeSidebar().should("not.exist");
    X.assertRowCount("155");

    X.saveQuestion(Q1_NAME);
  });

  it("verify: pivot table is preserved", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    cy.visit("/collection/root");

    cy.log(`-- ${Q1_NAME}: Assert that the pivot table viz is preserved --`);
    cy.findAllByTestId("collection-entry-name")
      .filter(`:contains(${Q1_NAME})`)
      .click();

    X.assertRowCount("155");

    cy.findAllByTestId("pivot-table-cell")
      .should("contain", "State")
      .should("contain", "Created At: Month")
      .and("contain", "Organic")
      .and("contain", "Row totals")
      .and("contain", "KS");

    H.snapshotCrossVersionDev("01-complete");
  });
});
