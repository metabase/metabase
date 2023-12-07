import {
  modal,
  popover,
  restore,
  describeEE,
  setupLdap,
  typeAndBlurUsingLabel,
  setTokenFeatures,
} from "e2e/support/helpers";

import {
  crudGroupMappingsWidget,
  checkGroupConsistencyAfterDeletingMappings,
} from "./shared/group-mappings-widget";

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.intercept("PUT", "/api/setting").as("updateSettings");
      cy.intercept("PUT", "/api/setting/*").as("updateSetting");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should setup ldap (metabase#16173)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapSettings();
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Success").should("exist");
    });

    it("should update ldap settings", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapPort("389");
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByRole("link", { name: "Authentication" }).first().click();
      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to disable and enable ldap", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Pause").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Paused").should("exist");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Resume").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to reset ldap settings", () => {
      setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      popover().findByText("Deactivate").click();
      modal().button("Deactivate").click();
      cy.wait("@updateSettings");

      getLdapCard().findByText("Set up").should("exist");
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

      cy.findByLabelText("LDAP Port").parent().parent().as("portSection");

      enterLdapSettings();
      enterLdapPort("asd");
      cy.get("@portSection")
        .findByText("That's not a valid port number")
        .should("exist");

      enterLdapPort("21.3");
      cy.get("@portSection")
        .findByText("That's not a valid port number")
        .should("exist");

      enterLdapPort("389 ");
      cy.get("@portSection")
        .findByText("That's not a valid port number")
        .should("not.exist");

      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Success").should("exist");
    });

    it("should allow user login on OSS when LDAP is enabled", () => {
      setupLdap();
      cy.signOut();
      cy.visit("/auth/login");
      cy.findByLabelText("Username or email address").type(
        "user01@example.org",
      );
      cy.findByLabelText("Password").type("123456");
      cy.button("Sign in").click();
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Home").should("exist");
      });
    });

    describe("Group Mappings Widget", () => {
      beforeEach(() => {
        cy.intercept("GET", "/api/setting").as("getSettings");
        cy.intercept("GET", "/api/session/properties").as(
          "getSessionProperties",
        );
        cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
        cy.intercept("PUT", "/api/permissions/membership/*/clear").as(
          "clearGroup",
        );
      });

      it("should allow deleting mappings along with deleting, or clearing users of, mapped groups", () => {
        crudGroupMappingsWidget("ldap");
      });

      it("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", () => {
        checkGroupConsistencyAfterDeletingMappings("ldap");
      });
    });
  },
);

describeEE(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should show the login form when ldap is enabled but password login isn't (metabase#25661)", () => {
      setupLdap();
      cy.request("PUT", "/api/setting/enable-password-login", { value: false });
      cy.signOut();
      cy.visit("/auth/login");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Username or email address").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("be.visible");
    });

    it("should allow user login on EE when LDAP is enabled", () => {
      setupLdap();
      cy.signOut();
      cy.visit("/auth/login");
      cy.findByLabelText("Username or email address").type(
        "user01@example.org",
      );
      cy.findByLabelText("Password").type("123456");
      cy.button("Sign in").click();
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Home").should("exist");
      });

      cy.signOut();
      cy.signInAsAdmin();

      // Check that attributes are synced
      cy.visit("/admin/people");
      cy.get(".ContentTable").within(() => {
        cy.findByText("Bar1 Bar1")
          .closest("tr")
          .within(() => {
            cy.icon("ellipsis").click();
          });
      });
      popover().within(() => {
        cy.findByText("Edit user").click();
      });
      cy.findByDisplayValue("uid").should("exist");
      cy.findByDisplayValue("homedirectory").should("exist");
    });
  },
);

const getLdapCard = () => {
  return cy.findByText("LDAP").parent().parent();
};

const enterLdapPort = value => {
  typeAndBlurUsingLabel("LDAP Port", value);
};

const enterLdapSettings = () => {
  typeAndBlurUsingLabel(/LDAP Host/, "localhost");
  typeAndBlurUsingLabel("LDAP Port", "389");
  typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  typeAndBlurUsingLabel("Password", "adminpass");
  typeAndBlurUsingLabel(/User search base/, "ou=users,dc=example,dc=org");
};
