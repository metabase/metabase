import { restore } from "__support__/e2e/cypress";

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should load needed data", () => {
    cy.visit("/question/new");
    cy.findByText("Native query").click();
    cy.icon("reference").click();
    // Force-clicking was needed here because Cypress complains that "ORDERS" is covered by a <div>
    // TODO: Maybe re-think the structure of that component because that div seems unnecessary anyway
    cy.findByText("ORDERS").click({ force: true });
    cy.findByText("QUANTITY").click({ force: true });
    cy.findByText("Number of products bought.");
  });
});
