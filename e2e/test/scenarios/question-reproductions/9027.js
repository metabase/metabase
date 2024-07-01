import {
  restore,
  openNativeEditor,
  startNewQuestion,
  openNavigationSidebar,
  entityPickerModal,
  entityPickerModalTab,
  navigationSidebar,
  popover,
} from "e2e/support/helpers";

const QUESTION_NAME = "Foo";

describe("issue 9027", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("Orders").should("exist");
      cy.button("Close").click();
    });

    openNativeEditor({ fromCurrentPage: true });

    cy.get(".ace_content").type("select 0");
    cy.findByTestId("native-query-editor-container").icon("play").click();

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
  entityPickerModal().within(() => {
    entityPickerModalTab("Saved questions").click();
    cy.findByText(questionName).should(exists ? "exist" : "not.exist");
    cy.button("Close").click();
  });
}

function saveQuestion(name) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByText("Save").click();

  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByLabelText("Name").clear().type(name);
    cy.findByText("Save").click();
  });

  cy.button("Not now").click();
  cy.wait("@saveQuestion");
}

function archiveQuestion(questionName) {
  navigationSidebar().findByText("Our analytics").click();
  openEllipsisMenuFor(questionName);
  popover().findByText("Move to trash").click();
}

function unarchiveQuestion(questionName) {
  navigationSidebar().within(() => {
    cy.findByText("Trash").click();
  });
  openEllipsisMenuFor(questionName);
  popover().findByText("Restore").click();
}

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}
