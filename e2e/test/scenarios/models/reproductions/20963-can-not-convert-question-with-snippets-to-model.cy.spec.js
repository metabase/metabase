import {
  restore,
  modal,
  openNativeEditor,
  saveQuestion,
  popover,
  openQuestionActions,
} from "e2e/support/helpers";

const snippetName = "string 'test'";
const questionName = "Converting questions with snippets to models";

describe("issue 20963", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow converting questions with static snippets to models (metabase#20963)", () => {
    cy.visit("/");

    openNativeEditor();

    // Creat a snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "'test'",
      );
      cy.findByLabelText("Give your snippet a name").type(snippetName);
      cy.findByText("Save").click();
    });

    cy.get("@editor").type("{moveToStart}select ");

    saveQuestion(questionName, { wrapId: true });

    // Convert into to a model
    openQuestionActions();
    popover().within(() => {
      cy.icon("model").click();
    });

    modal().within(() => {
      cy.findByText("Turn this into a model").click();
    });
  });
});
