import { restore, modal, filter, visitQuestion } from "__support__/e2e/helpers";

import {
  assertIsModel,
  assertQuestionIsBasedOnModel,
  selectFromDropdown,
  selectDimensionOptionFromSidebar,
  saveQuestionBasedOnModel,
  assertIsQuestion,
  openDetailsSidebar,
} from "./helpers/e2e-models-helpers";

describe("scenarios > models > revision history", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    cy.request("PUT", "/api/card/3", {
      name: "Orders Model",
      dataset: true,
    });
    cy.intercept("PUT", "/api/card/3").as("updateCard");
    cy.intercept("POST", "/api/revision/revert").as("revertToRevision");
  });

  it("should allow reverting to a saved question state", () => {
    cy.visit("/model/3");
    openDetailsSidebar();
    assertIsModel();

    cy.findByText("History").click();
    cy.button("Revert").click();
    cy.wait("@revertToRevision");

    assertIsQuestion();
    cy.get(".LineAreaBarChart");

    filter();
    selectDimensionOptionFromSidebar("Discount");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText(/Replace original question/i);
    });
  });

  it("should allow reverting to a model state", () => {
    cy.request("PUT", "/api/card/3", { dataset: false });

    visitQuestion(3);
    openDetailsSidebar();
    assertIsQuestion();

    cy.findByText("History").click();
    cy.findByText(/Turned this into a model/i)
      .closest("li")
      .within(() => {
        cy.button("Revert").click();
      });
    cy.wait("@revertToRevision");

    assertIsModel();
    cy.get(".LineAreaBarChart").should("not.exist");

    filter();
    selectDimensionOptionFromSidebar("Count");
    cy.findByText("Equal to").click();
    selectFromDropdown("Greater than");
    cy.findByPlaceholderText("Enter a number").type("2000");
    cy.button("Add filter").click();

    assertQuestionIsBasedOnModel({
      model: "Orders Model",
      collection: "Our analytics",
      table: "Orders",
    });

    saveQuestionBasedOnModel({ modelId: 3, name: "Q1" });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Orders Model",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.url().should("not.include", "/question/3");
  });
});
