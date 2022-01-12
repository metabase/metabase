import { restore, modal } from "__support__/e2e/cypress";

import {
  assertIsDataset,
  assertQuestionIsBasedOnDataset,
  selectFromDropdown,
  selectDimensionOptionFromSidebar,
  saveQuestionBasedOnDataset,
  assertIsQuestion,
  openDetailsSidebar,
} from "./helpers/e2e-datasets-helpers";

describe("scenarios > datasets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    cy.request("PUT", "/api/card/3", {
      name: "Orders Dataset",
      dataset: true,
    });
    cy.intercept("PUT", "/api/card/3").as("updateCard");
    cy.intercept("POST", "/api/revision/revert").as("revertToRevision");
  });

  it("should allow reverting to a saved question state", () => {
    cy.visit("/question/3");
    openDetailsSidebar();
    assertIsDataset();

    cy.findByText("History").click();
    cy.button("Revert").click();
    cy.wait("@revertToRevision");

    assertIsQuestion();
    cy.get(".LineAreaBarChart");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("Discount");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText(/Replace original question/i);
    });
  });

  it("should allow reverting to a dataset state", () => {
    cy.request("PUT", "/api/card/3", { dataset: false });

    cy.visit("/question/3");
    openDetailsSidebar();
    assertIsQuestion();

    cy.findByText("History").click();
    cy.findByText(/Turned this into a dataset/i)
      .closest("li")
      .within(() => {
        cy.button("Revert").click();
      });
    cy.wait("@revertToRevision");

    assertIsDataset();
    cy.get(".LineAreaBarChart").should("not.exist");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("Count");
    cy.findByText("Equal to").click();
    selectFromDropdown("Greater than");
    cy.findByPlaceholderText("Enter a number").type("2000");
    cy.button("Add filter").click();

    assertQuestionIsBasedOnDataset({
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    saveQuestionBasedOnDataset({ datasetId: 3, name: "Q1" });

    assertQuestionIsBasedOnDataset({
      questionName: "Q1",
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.url().should("not.include", "/question/3");
  });
});
