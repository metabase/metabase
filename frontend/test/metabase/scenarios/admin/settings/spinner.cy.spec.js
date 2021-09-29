import { restore } from "__support__/e2e/cypress";

describe("scenarios > admin > spinner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("API request", () => {
    it("should return correct DB", () => {
      cy.visit("/admin/databases/1");
      cy.findByText("Sample Dataset");
      cy.findByText("Add Database").should("not.exist");
    });

    it.skip("should not spin forever if it returns an error (metabase#11037)", () => {
      cy.visit("/admin/databases/999");
      cy.findAllByText("Databases").should("have.length", 2);
      cy.findByText("Loading...").should("not.exist");
    });
  });
});
