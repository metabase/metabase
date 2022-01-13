import { popover, modal } from "__support__/e2e/cypress";

export function assertQuestionIsBasedOnDataset({
  questionName,
  collection,
  dataset,
  table,
}) {
  if (questionName) {
    cy.findByText(questionName);
  }

  // Asserts shows dataset and its collection names
  // instead of db + table
  cy.findAllByText(collection);
  cy.findByText(dataset);

  cy.findByText("Sample Dataset").should("not.exist");
  cy.findByText(table).should("not.exist");
}

export function assertCreatedNestedQuery(datasetId) {
  cy.wait("@createCard").then(({ request }) => {
    expect(request.body.dataset_query.query["source-table"]).to.equal(
      `card__${datasetId}`,
    );
  });
}

export function saveQuestionBasedOnDataset({ datasetId, name }) {
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

  assertCreatedNestedQuery(datasetId);

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

// Requires dataset details sidebar to be open
export function assertIsDataset() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset").should("not.exist");
  });
  cy.findByText("Dataset management");
  cy.findByText("Sample Dataset").should("not.exist");

  // For native
  cy.findByText("This question is written in SQL.").should("not.exist");
  cy.get("ace_content").should("not.exist");
}

// Requires question details sidebar to be open
export function assertIsQuestion() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset");
  });
  cy.findByText("Dataset management").should("not.exist");
  cy.findByText("Sample Dataset");
}

export function turnIntoDataset() {
  openDetailsSidebar();
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset").click();
  });
  modal().within(() => {
    cy.button("Turn this into a dataset").click();
  });
}

export function selectFromDropdown(option, clickOpts) {
  popover()
    .findByText(option)
    .click(clickOpts);
}

export function joinTable(table) {
  cy.icon("join_left_outer").click();
  selectFromDropdown(table);
}

export function testDataPickerSearch({
  inputPlaceholderText,
  query,
  datasets = false,
  cards = false,
  tables = false,
} = {}) {
  cy.findByPlaceholderText(inputPlaceholderText).type(query);
  cy.wait("@search");

  cy.findAllByText(/Dataset in/i).should(datasets ? "exist" : "not.exist");
  cy.findAllByText(/Saved question in/i).should(cards ? "exist" : "not.exist");
  cy.findAllByText(/Table in/i).should(tables ? "exist" : "not.exist");

  cy.icon("close").click();
}
