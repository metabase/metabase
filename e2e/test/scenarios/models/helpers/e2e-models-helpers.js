import {
  entityPickerModal,
  entityPickerModalTab,
  interceptIfNotPreviouslyDefined,
  modal,
  openQuestionActions,
  popover,
} from "e2e/support/helpers";

export function assertQuestionIsBasedOnModel({
  questionName,
  collection,
  model,
  table,
}) {
  if (questionName) {
    cy.findByText(questionName);
  }

  // Asserts shows model and its collection names
  // instead of db + table
  cy.findAllByText(collection);
  cy.findByText(model);

  cy.findByText("Sample Database").should("not.exist");
  cy.findByText(table).should("not.exist");
}

export function assertCreatedNestedQuery(modelId) {
  cy.wait("@createCard").then(({ request }) => {
    expect(request.body.dataset_query.query["source-table"]).to.equal(
      `card__${modelId}`,
    );
  });
}

export function saveQuestionBasedOnModel({ modelId, name }) {
  cy.intercept("POST", "/api/card").as("createCard");

  cy.findByText("Save").click();

  cy.findByTestId("save-question-modal").within(() => {
    cy.findByText(/Replace original question/i).should("not.exist");
    if (name) {
      cy.findByLabelText("Name").clear().type(name);
    }
    cy.findByText("Save").click();
  });

  assertCreatedNestedQuery(modelId);

  modal().findByText("Not now").click();
}

export function selectDimensionOptionFromSidebar(name) {
  cy.get("[data-testid=dimension-list-item]").contains(name).click();
}

export function openDetailsSidebar() {
  cy.findByTestId("saved-question-header-title").click();
}

export function getDetailsSidebarActions() {
  return cy.findByTestId("question-action-buttons");
}

// Requires model actions to be open
export function assertIsModel() {
  popover().within(() => {
    cy.icon("model").should("not.exist");
  });
  cy.findByText("Sample Database").should("not.exist");

  // For native
  cy.findByText("This question is written in SQL.").should("not.exist");
  cy.get("ace_content").should("not.exist");
}

// Requires question actions to be open
export function assertIsQuestion() {
  popover().within(() => {
    cy.icon("model");
  });
  cy.findByText("Sample Database");
}

export function turnIntoModel() {
  interceptIfNotPreviouslyDefined({
    method: "PUT",
    url: "/api/card/*",
    alias: "cardUpdate",
  });

  openQuestionActions();
  popover().within(() => {
    cy.icon("model").click();
  });
  modal().within(() => {
    cy.button("Turn this into a model").click();
  });
  cy.wait("@cardUpdate");
}

export function selectFromDropdown(option, clickOpts) {
  popover().last().findByText(option).click(clickOpts);
}

export function startQuestionFromModel(modelName) {
  cy.findByTestId("app-bar").findByText("New").click();
  popover().findByText("Question").should("be.visible").click();
  entityPickerModal().within(() => {
    entityPickerModalTab("Models").click();
    cy.findByText(modelName).click();
  });
}
