import {
  restore,
  openNativeEditor,
  openQuestionActions,
  popover,
  entityPickerModal,
} from "e2e/support/helpers";

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show tables", () => {
    openNativeEditor();
    cy.icon("reference").click();
    cy.get("[data-testid='sidebar-header-title']").findByText(
      "Sample Database",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ORDERS").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Confirmed Sample Company orders for a product, from a user.",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("9 columns");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("QUANTITY").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Number of products bought.");
    // clicking the title should navigate back
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("QUANTITY").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ORDERS").click();
    cy.get("[data-testid='sidebar-header-title']")
      .findByText("Sample Database")
      .click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Data Reference");
  });

  it("should show models", () => {
    cy.createNativeQuestion(
      {
        name: "Native Products Model",
        description: "A model of the Products table",
        native: { query: "select id as renamed_id from products" },
        type: "model",
      },
      { visitQuestion: true },
    );
    // Move question to personal collection
    openQuestionActions();
    popover().findByTestId("move-button").click();

    entityPickerModal().within(() => {
      cy.findByRole("tab", { name: /Collections/ }).click();
      cy.findByText("Bobby Tables's Personal Collection").click();
      cy.button("Move").click();
    });

    openNativeEditor();
    cy.icon("reference").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2 models");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Native Products Model").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A model of the Products table"); // description
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Bobby Tables's Personal Collection"); // collection
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 column");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("RENAMED_ID").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No description");
  });
});
