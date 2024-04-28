import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getNotebookStep,
  leftSidebar,
  openNotebook,
  popover,
  restore,
  rightSidebar,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 32963", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );
  });

  it("should pick sensible display for model based questions (metabase#32963)", () => {
    cy.findByTestId("qb-header").button("Summarize").click();

    rightSidebar().within(() => {
      cy.findAllByText("Created At").eq(0).click();
      cy.button("Done").click();
    });
    cy.wait("@dataset");
    assertLineChart();

    // Go back to the original model
    cy.findByTestId("qb-header").findByText("Orders Model").click();
    openNotebook();

    cy.button("Summarize").click();
    popover().findByText("Count of rows").click();
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().findByText("Created At").click();
    visualize();
    assertLineChart();
  });
});

function assertLineChart() {
  cy.findByTestId("viz-type-button").click();
  leftSidebar().within(() => {
    cy.findByTestId("Line-container").should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.findByTestId("Table-container").should(
      "have.attr",
      "aria-selected",
      "false",
    );
  });
}
