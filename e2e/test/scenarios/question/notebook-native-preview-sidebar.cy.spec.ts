import {
  restore,
  openReviewsTable,
  visualize,
  openNotebook,
} from "e2e/support/helpers";

describe("scenarios > question > notebook > native query preview sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("smoke test: should show the preview sidebar, update it, persist it and close it", () => {
    const defaultRowLimit = 1048575;
    const queryLimit = 2;

    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");

    openReviewsTable({ mode: "notebook", limit: queryLimit });
    cy.findByLabelText("View the SQL").click();
    cy.wait("@nativeDataset");
    cy.findByTestId("native-query-preview-sidebar").within(() => {
      cy.findByText("SQL for this question").should("exist");
      cy.get(".ace_content")
        .should("contain", "SELECT")
        .and("contain", queryLimit);
      cy.button("Convert this question to SQL").should("exist");
    });

    cy.log(
      "Sidebar state should be persisted when navigating away from the notebook",
    );
    visualize();
    cy.findAllByTestId("header-cell").should("contain", "Rating");
    cy.findByTestId("native-query-preview-sidebar")
      .should("exist")
      .and("not.be.visible");

    openNotebook();
    cy.findByTestId("native-query-preview-sidebar").should("be.visible");

    cy.log("Modifying GUI query should update the SQL preview");
    cy.findByTestId("step-limit-0-0").icon("close").click({ force: true });
    cy.wait("@nativeDataset");
    cy.findByTestId("native-query-preview-sidebar")
      .get(".ace_content")
      .should("contain", "SELECT")
      .and("contain", defaultRowLimit)
      .and("not.contain", queryLimit);

    cy.log("It should be possible to close the sidebar");
    cy.findByLabelText("Hide the SQL").click();
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
  });

  it("should not offer the sidebar preview for a user without native permissions", () => {
    cy.signIn("nosql");
    openReviewsTable({ mode: "notebook" });
    cy.findByTestId("qb-header-action-panel")
      .find(".Icon")
      .should("have.length", 1);
    cy.findByLabelText("View the SQL").should("not.exist");
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
    cy.get("code").should("not.exist");
  });
});
