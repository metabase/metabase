import { restore } from "__support__/e2e/cypress";

describe("scenarios > auth > search", () => {
  beforeEach(restore);

  describe("universal search", () => {
    it("should work for admin", () => {
      cy.signInAsAdmin();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("Products");
    });

    it("should work for user with permissions (metabase#12332)", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("Products");
    });

    it("should not work for user without permissions", () => {
      cy.signIn("nodata");
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("Products").should("not.exist");
    });
  });
});
