import {
  restore,
  openNativeEditor,
  openQuestionActions,
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
    cy.findByText("ORDERS").click();
    cy.findByText(
      "Confirmed Sample Company orders for a product, from a user.",
    );
    cy.findByText("9 columns");
    cy.findByText("QUANTITY").click();
    cy.findByText("Number of products bought.");
    // clicking the title should navigate back
    cy.findByText("QUANTITY").click();
    cy.findByText("ORDERS").click();
    cy.get("[data-testid='sidebar-header-title']")
      .findByText("Sample Database")
      .click();
    cy.findByText("Data Reference");
  });

  it("should show models", () => {
    cy.createNativeQuestion(
      {
        name: "Native Products Model",
        description: "A model of the Products table",
        native: { query: "select id as renamed_id from products" },
        dataset: true,
      },
      { visitQuestion: true },
    );
    // Move question to personal collection
    openQuestionActions();
    cy.findByTestId("move-button").click();
    cy.findByText("My personal collection").click();
    cy.findByText("Move").click();

    openNativeEditor();
    cy.icon("reference").click();
    cy.findByText("1 model");
    cy.findByText("Native Products Model").click();
    cy.findByText("A model of the Products table"); // description
    cy.findByText("Bobby Tables's Personal Collection"); // collection
    cy.findByText("1 column");
    cy.findByText("RENAMED_ID").click();
    cy.findByText("No description");
  });
});
