import {
  restore,
  modal,
  filter,
  filterField,
  visitQuestion,
  openQuestionActions,
  closeQuestionActions,
  questionInfoButton,
} from "__support__/e2e/helpers";

import {
  assertIsModel,
  assertQuestionIsBasedOnModel,
  saveQuestionBasedOnModel,
  assertIsQuestion,
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
    visitModel(3);

    openRevisionHistory();
    revertTo("You created this");
    cy.wait("@dataset");

    openQuestionActions();
    assertIsQuestion();
    cy.get(".LineAreaBarChart");

    filter();
    filterField("Discount", {
      operator: "Not empty",
    });

    cy.findByTestId("apply-filters").click();

    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText(/Replace original question/i);
    });
  });

  it("should allow reverting to a model state", () => {
    cy.request("PUT", "/api/card/3", { dataset: false });

    visitQuestion(3);
    openQuestionActions();
    assertIsQuestion();
    closeQuestionActions();

    openRevisionHistory();

    cy.findByText(/Turned this into a model/i)
      .closest("li")
      .within(() => {
        cy.findByTestId("question-revert-button").click();
      });
    cy.wait("@revertToRevision");

    openQuestionActions();
    assertIsModel();
    closeQuestionActions();

    cy.get(".LineAreaBarChart").should("not.exist");

    filter();
    filterField("Count", {
      placeholder: "min",
      value: "2000",
    });
    cy.findByTestId("apply-filters").click();

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

function visitModel(id) {
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.visit(`/model/${id}`);
  cy.wait("@dataset");
}

function openRevisionHistory() {
  cy.intercept("GET", "/api/user").as("user");
  questionInfoButton().click();
  cy.wait("@user");
  cy.findByText("History");
}

function revertTo(history) {
  const r = new RegExp(history);
  cy.findByText(r).closest("li").findByTestId("question-revert-button").click();
}
