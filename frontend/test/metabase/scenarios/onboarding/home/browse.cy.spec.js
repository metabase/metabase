import { restore } from "__support__/e2e/helpers";

describe("scenarios > browse data", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("basic UI flow should work", () => {
    cy.visit("/");
    cy.findByText(/Browse data/).click();
    cy.location("pathname").should("eq", "/browse");
    cy.findByText(/^Our data$/i);
    cy.findByText("Sample Database");
    cy.findByText("Learn about our data").click();
    cy.location("pathname").should("eq", "/reference/databases");
  });
});
