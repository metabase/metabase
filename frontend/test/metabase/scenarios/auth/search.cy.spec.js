import {
  restore,
  signInAsAdmin,
  signInAsNormalUser,
  signIn,
} from "__support__/cypress";

describe("scenarios > auth > search", () => {
  before(restore);

  describe("universal search", () => {
    it("should work for admin", () => {
      signInAsAdmin();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS");
    });

    it("should work for user with permissions (metabase#12332)", () => {
      signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS");
    });

    it("should not work for user without permissions", () => {
      signIn("nodata");
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS").should("not.exist");
    });
  });
});
