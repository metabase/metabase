import { restore, signInAsAdmin } from "../../../__support__/cypress";

describe("scenarios > x-rays", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should exist on homepage when person first signs in", () => {
    cy.visit("/");
    cy.contains("A look at your People table");
    cy.contains("A look at your Orders table");
    cy.contains("A look at your Products table");
    cy.contains("A look at your Reviews table");
  });

  it("should be populated", () => {
    cy.visit("/");
    cy.findByText("People table").click();

    cy.findByText("Something's gone wrong").should("not.exist");
    cy.findByText("Here's an overview of the people in your People table");
    cy.findByText("Overview");
    cy.findByText("Per state");
    cy.get(".Card").should("have.length", 11);
  });
});
