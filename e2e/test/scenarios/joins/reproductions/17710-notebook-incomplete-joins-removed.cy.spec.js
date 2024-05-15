import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openOrdersTable,
  restore,
  visualize,
} from "e2e/support/helpers";

describe("issue 17710", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should remove only invalid join clauses (metabase#17710)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    getNotebookStep("join").icon("add").click();

    // Close the LHS column popover that opens automatically
    getNotebookStep("join").parent().click();

    visualize();

    cy.icon("notebook")
      .click()
      .then(() => {
        cy.findByTestId("step-join-0-0").within(() => {
          cy.findByText("ID");
          cy.findByText("Product ID");
        });
      });
  });
});
