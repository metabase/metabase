import {
  focusNativeEditor,
  main,
  modal,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issues 35039 and 37009", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/database/*/card_autocomplete_suggestions**").as(
      "autocomplete",
    );
  });

  it("should show columns available in the model (metabase#35039)", () => {
    cy.createNativeQuestion({
      name: "Base model",
      type: "model",
      native: {
        query: `
          select 1 as "client_id", 1 as "value"
          UNION select 1 as "client_id", 2 as "value"
          UNION select 2 as "client_id", 3 as "value"
          UNION select 3 as "client_id", 4 as "value"`,
      },
    });

    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    focusNativeEditor().type("select * from {{#base");
    cy.wait("@autocomplete");
    cy.realPress("Enter");

    cy.findByTestId("dataset-edit-bar").findByText("Save").click();
    modal()
      .last()
      .within(() => {
        cy.findByLabelText("Name").type("Model 1").realPress("Tab");
        cy.findByText("Save").click();
      });

    openQuestionActions();

    popover().findByText("Edit query definition").click();
    focusNativeEditor().type("{enter}-- comment");
    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.findByText("Save changes").click();
      cy.findByText("Saving changes...").should("not.exist");
    });

    main().within(() => {
      cy.findByText("Doing science...").should("be.visible");
      cy.findByText("Doing science...").should("not.exist");
    });

    cy.icon("notebook").click();

    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("client_id").should("exist");
      cy.findByText("value").should("exist");
    });
  });
});
