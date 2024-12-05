import { H } from "e2e/support";

describe("issue 39448", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should load joined table metadata for suggested join conditions (metabase#39448)", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByTestId("action-buttons").button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table").should("have.text", "Products");
      cy.findByLabelText("Left column")
        .findByText("Product ID")
        .should("be.visible");
      cy.findByLabelText("Right column").findByText("ID").should("be.visible");
      cy.findByLabelText("Change operator").should("have.text", "=");
    });
  });
});
