import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > joins > custom expressions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support expressions in join conditions referencing model columns", () => {
    H.visitModel(ORDERS_MODEL_ID);
    H.openNotebook();

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Orders Model").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[ID] + [User ID]" });
      cy.button("Done").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[ID] + [Product ID]" });
      cy.button("Done").click();
    });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
    });

    H.visualize();
    H.assertQueryBuilderRowCount(9);
  });

  it("should allow to update a join with a join condition with custom expressions", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Reviews").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "1" });
      cy.button("Done").click();
    });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "1" });
      cy.button("Done").click();
    });

    H.getNotebookStep("join").findByLabelText("Change operator").click();
    H.popover().findByText("=").click();
    H.getNotebookStep("join").findByLabelText("Change join type").click();
    H.popover().findByText("Inner join").click();
    H.getNotebookStep("join")
      .findByLabelText("Left column")
      .findByText("1")
      .click();
    H.enterCustomColumnDetails({ formula: "[ID] + 1" });
    H.popover().button("Update").click();
    H.getNotebookStep("join")
      .findByLabelText("Right column")
      .findByText("1")
      .click();
    H.enterCustomColumnDetails({ formula: "[Reviews → ID] + 1" });
    H.popover().button("Update").click();

    H.visualize();
    H.assertTableRowsCount(1112);
  });
});
