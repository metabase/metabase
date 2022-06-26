import { popover, modal } from "__support__/e2e/helpers";

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

  modal().within(() => {
    cy.findByText(/Replace original question/i).should("not.exist");
    if (name) {
      cy.findByLabelText("Name")
        .clear()
        .type(name);
    }
    cy.findByText("Save").click();
  });

  assertCreatedNestedQuery(modelId);

  modal()
    .findByText("Not now")
    .click();
}

export function selectDimensionOptionFromSidebar(name) {
  cy.get("[data-testid=dimension-list-item]")
    .contains(name)
    .click();
}

export function openDetailsSidebar() {
  cy.findByTestId("saved-question-header-button").click();
}

export function getDetailsSidebarActions() {
  return cy.findByTestId("question-action-buttons");
}

// Requires model details sidebar to be open
export function assertIsModel() {
  getDetailsSidebarActions().within(() => {
    cy.icon("model").should("not.exist");
  });
  cy.findByText("Model management");
  cy.findByText("Sample Database").should("not.exist");

  // For native
  cy.findByText("This question is written in SQL.").should("not.exist");
  cy.get("ace_content").should("not.exist");
}

// Requires question details sidebar to be open
export function assertIsQuestion() {
  getDetailsSidebarActions().within(() => {
    cy.icon("model");
  });
  cy.findByText("Model management").should("not.exist");
  cy.findByText("Sample Database");
}

export function turnIntoModel() {
  openDetailsSidebar();
  getDetailsSidebarActions().within(() => {
    cy.icon("model").click();
  });
  modal().within(() => {
    cy.button("Turn this into a model").click();
  });
}

export function selectFromDropdown(option, clickOpts) {
  popover()
    .last()
    .findByText(option)
    .click(clickOpts);
}

export function startQuestionFromModel(modelName) {
  cy.findByText("New").click();
  cy.findByText("Question")
    .should("be.visible")
    .click();
  cy.findByText("Models").click();
  cy.findByText(modelName).click();
}
