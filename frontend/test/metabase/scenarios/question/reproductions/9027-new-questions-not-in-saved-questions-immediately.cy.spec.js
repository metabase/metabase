import {
  restore,
  popover,
  openNativeEditor,
  openNotebookEditor,
} from "__support__/e2e/cypress";

const QUESTION_NAME = "Foo";

describe("issue 9027", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();

    // Wait for the existing questions to load
    cy.findByText("Orders");

    openNativeEditor({ fromCurrentPage: true });

    cy.get(".ace_content").type("select 0");
    cy.get(".NativeQueryEditor .Icon-play").click();

    saveQuestion(QUESTION_NAME);
  });

  it("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", () => {
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
    archiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME, false);
    unarchiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
  });
});

function goToSavedQuestionPickerAndAssertQuestion(questionName, exists = true) {
  openNotebookEditor({ fromCurrentPage: true });
  cy.findByText("Saved Questions").click();

  cy.findByText(questionName).should(exists ? "exist" : "not.exist");
}

function saveQuestion(name) {
  cy.findByText("Save").click();
  cy.findByLabelText("Name").type(name);
  cy.button("Save").click();
  cy.button("Not now").click();
}

function archiveQuestion(questionName) {
  cy.findByTestId("main-logo").click();
  cy.findByText("Browse all items").click();
  openEllipsisMenuFor(questionName);
  popover()
    .findByText("Archive")
    .click();
}

function unarchiveQuestion(questionName) {
  cy.findByTestId("main-logo").click();
  cy.findByText("Browse all items").click();
  // Button is covered with an undo toast
  cy.findByText("View archive").click({ force: true });
  cy.findByText(questionName)
    .parent()
    .within(() => {
      cy.icon("unarchive").click({ force: true });
    });
}

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}
