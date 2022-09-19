import { restore } from "__support__/e2e/helpers";

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
  });

  it("should be able to connect to a ldap server", () => {
    cy.visit("/admin/settings/authentication/ldap");

    cy.findByLabelText("LDAP Host").type("localhost");
    cy.findByLabelText("LDAP Port").type("3004");
    cy.findByLabelText("User search base").type("dc=test");
    cy.findByLabelText("Group search base").type("dc=test");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");

    cy.findByText("Changes saved!").should("be.visible");
  });
});
