import {
  restore,
  modal,
  openNativeEditor,
  popover,
  openQuestionActions,
} from "e2e/support/helpers";

const snippetName = `string 'test'`;
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        `'test'`,
      );
      cy.findByLabelText("Give your snippet a name").type(snippetName);
      cy.findByText("Save").click();
    });

    cy.get("@editor").type(`{moveToStart}select `);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().within(() => {
      // I don't know why the input lost focus, especially when we ran the query before saving.
      // that'll be worse as the characters we type will go to the query input instead of the
      // name input.
      cy.findByLabelText("Name").type(questionName);
      cy.findByText("Save").click();
    });

    // dismiss modal
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

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
