import { restore } from "__support__/e2e/helpers";

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
  });

  it("should use the correct endpoint for saving settings (metabase#16173)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    cy.findByLabelText("LDAP Host").type("localhost");
    cy.findByLabelText("LDAP Port").type("3004");
    cy.findByLabelText("User search base").type("dc=test");
    cy.findByLabelText("Group search base").type("dc=test");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");

    cy.findByText("Changes saved!").should("be.visible");
  });

  it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    cy.findByLabelText("LDAP Host").type("localhost");
    cy.findByLabelText("LDAP Port").type("0");
    cy.findByLabelText("User search base").type("dc=test");
    cy.findByLabelText("Group search base").type("dc=test");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");

    cy.findAllByText("Wrong host or port").should("exist");
    cy.findByDisplayValue("localhost").should("exist");
  });

  it("shouldn't be possible to save non-numeric port (#13313)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    cy.findByLabelText("LDAP Host").type("localhost");
    cy.findByLabelText("User search base").type("dc=test");
    cy.findByLabelText("Group search base").type("dc=test");

    cy.findByLabelText("LDAP Port").clear().type("asd");
    cy.findByText("That's not a valid port number").should("be.visible");

    cy.findByLabelText("LDAP Port").clear().type("21.3");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");
    cy.findByText('For input string: "21.3"').should("be.visible");

    cy.findByLabelText("LDAP Port").clear().type("123 ");
    cy.button("Save failed").click();
    cy.wait("@updateLdapSettings");
    cy.findByText('For input string: "123 "').should("be.visible");
  });
});
