import {
  restore,
  setupLdap,
  typeAndBlurUsingLabel,
} from "__support__/e2e/helpers";

describe("scenarios > admin > settings > SSO > LDAP", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
    cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
  });

  it("should allow to toggle the authentication method when it is configured", () => {
    setupLdap({ enabled: false });
    cy.visit("/admin/settings/authentication");

    cy.findByRole("switch", { name: "LDAP" }).click();
    cy.wait("@updateSetting");

    cy.findByRole("switch", { name: "LDAP" }).should("be.checked");
    cy.findByText("Saved").should("be.visible");
  });

  it("should use the correct endpoint for saving settings (metabase#16173)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    enterLdapSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");

    cy.findByText("Changes saved!").should("be.visible");
  });

  it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    enterLdapSettings();
    typeAndBlurUsingLabel("LDAP Port", "0");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");

    cy.findAllByText("Wrong host or port").should("exist");
    cy.findByDisplayValue("localhost").should("exist");
  });

  it("shouldn't be possible to save a non-numeric port (#13313)", () => {
    cy.visit("/admin/settings/authentication/ldap");

    enterLdapSettings();
    typeAndBlurUsingLabel("LDAP Port", "asd");
    cy.findByText("That's not a valid port number").should("be.visible");

    typeAndBlurUsingLabel("LDAP Port", "21.3");
    cy.button("Save and enable").click();
    cy.wait("@updateLdapSettings");
    cy.findByText('For input string: "21.3"').should("be.visible");

    typeAndBlurUsingLabel("LDAP Port", "123 ");
    cy.button("Save failed").click();
    cy.wait("@updateLdapSettings");
    cy.findByText('For input string: "123 "').should("be.visible");
  });
});

const enterLdapSettings = () => {
  typeAndBlurUsingLabel("LDAP Host", "localhost");
  typeAndBlurUsingLabel("LDAP Port", "389");
  typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  typeAndBlurUsingLabel("Password", "admin");
  typeAndBlurUsingLabel("User search base", "dc=example,dc=org");
};
