import { Q2_NAME } from "../constants";

import * as X from "./helpers";

const { H } = cy;

describe("Cross-version questions - joins", () => {
  it("setup: creates a joined question", { tags: ["@source"] }, () => {
    H.restoreCrossVersionDev("01-complete");
    cy.signIn("admin", { skipCache: true });

    cy.log("-- Create a joined question --");

    cy.visit("/");
    H.newButton("Question").click();

    X.joinTables("Orders", "Products");

    cy.log("-- Filter on the joined table --");
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().within(() => {
      cy.findByRole("heading", { name: "Products" }).click();
      cy.findByLabelText("Price").click();
    });

    H.popover().within(() => {
      cy.findByLabelText("Filter operator").should("have.text", "Between");
      cy.findByPlaceholderText("Min").type("0");
      cy.findByPlaceholderText("Min").type("50").blur();
      cy.button("Add filter").click();
    });

    cy.log("-- Add aggregation --");
    H.addSummaryField({ metric: "Average of ..." });
    X.selectFromPopover("Discount");

    cy.log("-- Add breakouts --");
    H.addSummaryGroupingField({ table: "Products", field: "Category" });

    cy.log("-- Sort the columns --");
    cy.findByLabelText("Sort").click();
    X.selectFromPopover("Average of Discount");

    H.visualize();
    X.assertRowCount("4");

    X.saveQuestion(Q2_NAME);
  });

  it("verify: bar chart is preserved", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    cy.visit("/collection/root");
    cy.findAllByTestId("collection-entry-name")
      .filter(`:contains(${Q2_NAME})`)
      .click();

    X.assertRowCount("4");

    cy.log("-- Assert that there are four bars --");
    H.chartPathWithFillColor("#A989C5").should("have.length", 4);
    H.echartsContainer()
      .find("text")
      .should("contain", "Average of Discount")
      .and("contain", "Products → Category")
      .and("contain", "Doohickey")
      .and("contain", "Gizmo")
      .and("contain", "$0")
      .and("contain", "$5.00");

    H.snapshotCrossVersionDev("02-complete");
  });
});
