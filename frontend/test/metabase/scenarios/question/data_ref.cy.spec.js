import { signInAsAdmin, restore } from "__support__/cypress";

describe("scenarios > question > data reference sidebar", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should load needed data", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.reload(); // reload to remove data preloaded on new question page
    cy.get(".Icon-reference").click(); // open data ref
    cy.contains("ORDERS").click();
    cy.contains("QUANTITY").click();
    cy.contains("Number of products bought.");
  });
});
