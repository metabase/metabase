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

  it.skip("should be populated (Issue #12917)", () => {
    cy.visit("/");
    cy.findByText("People table").click();
    cy.findByText("Something's gone wrong").should("not.exist");
  });
});
