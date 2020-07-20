import { restore, signInAsAdmin, signIn } from "__support__/cypress";
import { signInAsNormalUser } from "../../../__support__/cypress";

describe("scenarios > auth > search", () => {
  before(restore);

  describe("universal search", () => {
    it("should work for admin", () => {
      signInAsAdmin();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS");
    });

    it.skip("should work for user with permissions (Issue #12332)", () => {
      signInAsNormalUser();
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS");
    });

    it("should not work for user without permissions", () => {
      // Take away table permissions
      signInAsAdmin();
      cy.visit("/admin/permissions/collections");
      cy.get(".Icon-check")
        .last()
        .click();
      cy.findByText("Revoke access").click();
      cy.findByText("Save Changes").click();

      cy.findByText("Are you sure you want to do this?");
      cy.findByText("Yes").click();

      // Check
      signIn("nodata");
      cy.visit("/");
      cy.findByPlaceholderText("Search…").type("product{enter}");
      cy.findByText("PRODUCTS").should("not.exist");
    });
  });
});
