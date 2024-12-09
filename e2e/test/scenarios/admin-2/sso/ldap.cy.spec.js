import { H } from "e2e/support";

import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
} from "./shared/group-mappings-widget";
import { getSuccessUi, getUserProvisioningInput } from "./shared/helpers";

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
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
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      enterLdapPort("389");
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      cy.findAllByRole("link", { name: "Authentication" }).first().click();
      getLdapCard().findByText("Active").should("exist");
    });

    it("should allow to disable and enable ldap", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Pause").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Paused").should("exist");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Resume").click();
      cy.wait("@updateSetting");
      getLdapCard().findByText("Active").should("exist");
    });

    it("should not show the user provision UI to OSS users", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      cy.findByTestId("admin-layout-content")
        .findByText("User Provisioning")
        .should("not.exist");
    });

    it("should allow to reset ldap settings", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication");

      getLdapCard().icon("ellipsis").click();
      H.popover().findByText("Deactivate").click();
      H.modal().button("Deactivate").click();
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
      H.setupLdap();
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

H.describeEE(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
    });

    it("should allow the user to enable/disable user provisioning", () => {
      H.setupLdap();
      cy.visit("/admin/settings/authentication/ldap");

      const { label, input } = getUserProvisioningInput();
      input.should("be.checked");
      label.click();
      cy.button("Save changes").click();
      cy.wait("@updateLdapSettings");

      getSuccessUi().should("exist");
    });

    it("should show the login form when ldap is enabled but password login isn't (metabase#25661)", () => {
      H.setupLdap();
      H.updateSetting("enable-password-login", false);
      cy.signOut();
      cy.visit("/auth/login");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Username or email address").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("be.visible");
    });

    it("should allow user login on EE when LDAP is enabled", () => {
      H.setupLdap();
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
      cy.findByTestId("admin-people-list-table").within(() => {
        cy.findByText("Bar1 Bar1")
          .closest("tr")
          .within(() => {
            cy.icon("ellipsis").click();
          });
      });
      H.popover().within(() => {
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
  H.typeAndBlurUsingLabel("LDAP Port", value);
};

const enterLdapSettings = () => {
  H.typeAndBlurUsingLabel(/LDAP Host/, "localhost");
  H.typeAndBlurUsingLabel("LDAP Port", "389");
  H.typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
  H.typeAndBlurUsingLabel("Password", "adminpass");
  H.typeAndBlurUsingLabel(/User search base/, "ou=users,dc=example,dc=org");
};
