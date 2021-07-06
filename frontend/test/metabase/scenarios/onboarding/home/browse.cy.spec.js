import { restore } from "__support__/e2e/cypress";

describe("scenarios > browse data", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("basic UI flow should work", () => {
    cy.visit("/");
    cy.icon("table_spaced").click();
    cy.location("pathname").should("eq", "/browse");
    cy.findByText(/^Our data$/i);
    cy.findByText("Sample Dataset");
    cy.findByText("Learn about our data").click();
    cy.location("pathname").should("eq", "/reference/databases");
  });
});
