import { restore } from "e2e/support/helpers";

describe("scenarios > admin > spinner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("API request", () => {
    it("should not spin forever if it returns an error (metabase#11037)", () => {
      cy.visit("/admin/databases/999");
      cy.findAllByText("Databases").should("have.length", 2);
      cy.findByText("Loading...").should("not.exist");
      cy.findByText("Not found.");
    });
  });
});
