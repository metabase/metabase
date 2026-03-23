import { Q1_PIVOT_NAME } from "../constants";
import { saveSimpleQuestion } from "../cross-version-helpers";

const { H } = cy;

describe("Cross-version questions - pivot", () => {
  it("setup: creates a pivot table", { tags: ["@source"] }, () => {
    H.restoreCrossVersionDev("00-complete");
    cy.signIn("admin", { skipCache: true });

    cy.visit("/");

    cy.log("Create a pivot table");

    H.newButton("Question").click();
    H.modal().contains("People").click();

    cy.log("Narrow down the states that start with K (only two)");

    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().contains("State").click();
    cy.findByLabelText("Filter operator").click();
    H.popover().contains("Starts with").click();
    cy.findByLabelText("Filter value").type("K").blur();
    cy.button("Add filter").click();

    cy.log("Add aggregation");
    H.addSummaryField({ metric: "Count of rows" });

    cy.log("Add breakouts");
    H.addSummaryGroupingField({ field: "State" });
    H.addSummaryGroupingField({ field: "Source" });
    H.addSummaryGroupingField({ field: "Created At" });

    H.visualize();

    cy.log("Render as pivot table");
    cy.intercept("POST", "/api/dataset/pivot").as("pivot");
    H.openVizTypeSidebar();
    H.vizTypeSidebar().within(() => {
      cy.findAllByRole("option").filter(":contains(Pivot Table)").click();
      cy.wait("@pivot");
      cy.button("Done").click();
    });
    H.vizTypeSidebar().should("not.exist");

    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 155 rows",
    );
    saveSimpleQuestion(Q1_PIVOT_NAME);
  });

  it("verify: pivot table is preserved", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    cy.visit("/collection/root");

    cy.log(`${Q1_PIVOT_NAME}: Assert that the pivot table viz is preserved`);
    cy.findAllByTestId("collection-entry-name")
      .filter(`:contains(${Q1_PIVOT_NAME})`)
      .click();

    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 155 rows",
    );

    cy.findAllByTestId("pivot-table-cell")
      .should("contain", "State")
      .should("contain", "Created At: Month")
      .and("contain", "Organic")
      .and("contain", "Row totals")
      .and("contain", "KS");

    H.snapshotCrossVersionDev("01-complete");
  });
});
