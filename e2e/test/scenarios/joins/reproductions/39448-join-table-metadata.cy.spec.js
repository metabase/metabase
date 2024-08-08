import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openOrdersTable,
  restore,
} from "e2e/support/helpers";

describe("issue 39448", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should load joined table metadata for suggested join conditions (metabase#39448)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByTestId("action-buttons").button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table").should("have.text", "Products");
      cy.findByLabelText("Left column")
        .findByText("Product ID")
        .should("be.visible");
      cy.findByLabelText("Right column").findByText("ID").should("be.visible");
      cy.findByLabelText("Change operator").should("have.text", "=");
    });
  });
});
