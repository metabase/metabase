import { restore } from "e2e/support/helpers";

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
    cy.findByText("Learn about our data").click();
    cy.location("pathname").should("eq", "/reference/databases");
    cy.go("back");
    cy.findByText("Sample Database").click();
    cy.findByText("Products").click();
    cy.findByText("Rustic Paper Wallet");
  });
});
