import { restore, openNativeEditor } from "__support__/e2e/helpers";

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show tables", () => {
    openNativeEditor();
    cy.icon("reference").click();
    cy.findByText("ORDERS").click();
    cy.findByText(
      "Confirmed Sample Company orders for a product, from a user.",
    );
    cy.findByText("9 columns");
    cy.findByText("QUANTITY").click();
    cy.findByText("Number of products bought.");
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
    openNativeEditor();
    cy.icon("reference").click();
    cy.findByText("1 model");
    cy.findByText("Native Products Model").click();
    cy.findByText("A model of the Products table");
    cy.findByText("1 column");
    cy.findByText("RENAMED_ID").click();
    cy.findByText("No description");
  });
});
