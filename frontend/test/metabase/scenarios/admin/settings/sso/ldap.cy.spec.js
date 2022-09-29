import {
  restore,
  setupLdap,
  typeAndBlurUsingLabel,
} from "__support__/e2e/helpers";

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.intercept("PUT", "/api/setting/*").as("updateSetting");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
    });

    it("should setup ldap (metabase#16173)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findByText("Changes saved!").should("exist");
    });

    it("should update ldap settings", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapPort("389");
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByRole("link", { name: "Authentication" }).first().click();
      cy.findByRole("switch", { name: "LDAP" }).should("be.checked");
    });

    it("should toggle ldap via the authentication page", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication");

      cy.findByRole("switch", { name: "LDAP" }).click();
      cy.wait("@updateSetting");

      cy.findByRole("switch", { name: "LDAP" }).should("not.be.checked");
      cy.findByText("Saved").should("exist");
    });

    it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("0");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByText("Wrong host or port").should("exist");
      cy.findByDisplayValue("localhost").should("exist");
    });

    it("shouldn't be possible to save a non-numeric port (#13313)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      enterLdapPort("asd");
      cy.findByText("That's not a valid port number").should("exist");

      enterLdapPort("21.3");
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");
      cy.findByText('For input string: "21.3"').should("exist");

      enterLdapPort("123 ");
      cy.button("Save failed").click();
      cy.wait("@updateLdapSettings");
      cy.findByText('For input string: "123 "').should("exist");
    });

    it("should show the login form when ldap is enabled but password login isn't (metabase#25661)", () => {
      setupLdap();
      cy.request("PUT", "/api/setting/enable-password-login", { value: false });
      cy.signOut();
      cy.visit("/auth/login");

      cy.findByText("Username or email address").should("be.visible");
      cy.findByText("Password").should("be.visible");
    });
  },
);

const enterLdapPort = value => {
  typeAndBlurUsingLabel("LDAP Port", value);
};

const enterLdapSettings = () => {
  typeAndBlurUsingLabel("LDAP Host", "localhost");
  typeAndBlurUsingLabel("LDAP Port", "389");
  typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  typeAndBlurUsingLabel("Password", "admin");
  typeAndBlurUsingLabel("User search base", "dc=example,dc=org");
};
