import { signInAsNormalUser } from "__support__/cypress";

describe("data ref sidebar", () => {
  beforeEach(signInAsNormalUser);

  it("should let users view tables and fields", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".Icon-reference").click();
    cy.contains("ORDERS").click();
    cy.contains("This is a confirmed order for a product from a user");
    cy.contains("QUANTITY").click();
    cy.contains("Number of products bought.");
  });
});
