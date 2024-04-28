import {
  focusNativeEditor,
  modal,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issues 35039 and 37009", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsNormalUser();
  });

  // This test follows #37009 repro steps because they are simpler than #35039 but still equivalent
  it("should show columns available in the model (metabase#35039) (metabase#37009)", () => {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    focusNativeEditor().type("select * from products -- where true=false");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save").click();
    modal()
      .last()
      .within(() => {
        cy.findByLabelText("Name").type("Model").realPress("Tab");
        cy.findByText("Save").click();
      });

    openQuestionActions();
    popover().findByText("Edit query definition").click();

    focusNativeEditor().type(
      "{backspace}{backspace}{backspace}{backspace}{backspace}",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.findByText("Save changes").click();
      cy.findByText("Saving…").should("not.exist");
    });

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByText("Doing science...").should("be.visible");
      cy.findByText("Doing science...").should("not.exist");
    });

    cy.icon("notebook").click();
    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("ID").should("exist");
      cy.findByText("EAN").should("exist");
      cy.findByText("TITLE").should("exist");
      cy.findByText("CATEGORY").should("exist");
      cy.findByText("VENDOR").should("exist");
      cy.findByText("PRICE").should("exist");
      cy.findByText("RATING").should("exist");
      cy.findByText("CREATED_AT").should("exist");
    });
  });
});
