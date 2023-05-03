import {
  restore,
  popover,
  openNativeEditor,
  startNewQuestion,
  openNavigationSidebar,
  navigationSidebar,
} from "e2e/support/helpers";

const QUESTION_NAME = "Foo";

describe("issue 9027", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions").click();

    // Wait for the existing questions to load
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");

    openNativeEditor({ fromCurrentPage: true });

    cy.get(".ace_content").type("select 0");
    cy.get(".NativeQueryEditor .Icon-play").click();

    saveQuestion(QUESTION_NAME);
  });

  it("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", () => {
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
    openNavigationSidebar();
    archiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME, false);
    openNavigationSidebar();
    unarchiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
  });
});

function goToSavedQuestionPickerAndAssertQuestion(questionName, exists = true) {
  startNewQuestion();
  cy.findByText("Saved Questions").click();

  cy.findByText(questionName).should(exists ? "exist" : "not.exist");
}

function saveQuestion(name) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByText("Save").click();
  cy.findByLabelText("Name").clear().type(name);
  cy.button("Save").click();
  cy.button("Not now").click();
  cy.wait("@saveQuestion");
}

function archiveQuestion(questionName) {
  navigationSidebar().findByText("Our analytics").click();
  openEllipsisMenuFor(questionName);
  popover().findByText("Archive").click();
}

function unarchiveQuestion(questionName) {
  navigationSidebar().within(() => {
    cy.icon("ellipsis").click();
  });
  popover().findByText("View archive").click();
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
