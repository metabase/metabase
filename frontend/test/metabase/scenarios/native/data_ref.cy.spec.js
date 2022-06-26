import { restore, openNativeEditor } from "__support__/e2e/helpers";

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should load needed data", () => {
    openNativeEditor();
    cy.icon("reference").click();
    // Force-clicking was needed here because Cypress complains that "ORDERS" is covered by a <div>
    // TODO: Maybe re-think the structure of that component because that div seems unnecessary anyway
    cy.findByText("ORDERS").click({ force: true });
    cy.findByText(
      "Confirmed Sample Company orders for a product, from a user.",
    );
    cy.findByText("9 columns");

    cy.findByText("QUANTITY").click({ force: true });
    cy.findByText("Number of products bought.");
  });
});
