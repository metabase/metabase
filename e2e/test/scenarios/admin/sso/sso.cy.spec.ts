const { H } = cy;
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import { groupMappingCardHelpers } from "./shared/group-mapping-card";
import { getSamlCertificate, setupSaml } from "./shared/helpers";

const GOOGLE_CLIENT_ID_SUFFIX = "apps.googleusercontent.com";

const MOCK_IDP_PORT = 6130;
const OIDC_ISSUER_URI = `http://localhost:${MOCK_IDP_PORT}`;

describe("scenarios > admin > settings > SSO > Google", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/google/settings").as("updateGoogleSettings");
  });

  it("should reject a client id without the correct suffix, save the client id on subsequent tries, and show the sign-in button (metabase#15974, metabase#15975)", () => {
    cy.visit("/admin/settings/authentication/google");

    cy.log(
      "A client id that does not end with the correct suffix shows an error (metabase#15975)",
    );
    H.typeAndBlurUsingLabel("Client ID", "fake-client-id");
    cy.button("Save and enable").click();
    cy.wait("@updateGoogleSettings");
    cy.findByTestId("admin-layout-content")
      .findByText(
        `Invalid Google Sign-In Client ID: must end with ".${GOOGLE_CLIENT_ID_SUFFIX}"`,
      )
      .should("be.visible");

    cy.log(
      "A valid client id is saved, and so is a later change to it (metabase#15974)",
    );
    H.typeAndBlurUsingLabel("Client ID", `example1.${GOOGLE_CLIENT_ID_SUFFIX}`);
    // the submit button reads "Failed" for 5s after the rejected save
    cy.button(/Save and enable|Failed/).click();
    cy.wait("@updateGoogleSettings");
    cy.reload();
    cy.findByDisplayValue(`example1.${GOOGLE_CLIENT_ID_SUFFIX}`).should(
      "be.visible",
    );

    H.typeAndBlurUsingLabel("Client ID", `example2.${GOOGLE_CLIENT_ID_SUFFIX}`);
    cy.button("Save changes").click();
    cy.wait("@updateGoogleSettings");
    cy.findByRole("button", { name: "Success" }).should("be.visible");

    cy.log("The login page draws Google's sign-in button");
    cy.signOut();
    cy.visit("/auth/login");
    cy.findByRole("button", { name: /Google/ }).should("be.visible");
  });
});

describe("scenarios > admin > settings > SSO > JWT", () => {
  const { mappingRow, addMapping } = groupMappingCardHelpers({
    sectionTestId: "jwt-group-schema",
    nameLabel: "JWT group name",
    newMappingLabel: "New mapping",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", /\/api\/setting$/).as("updateSettings");
  });

  it("should allow to save and enable jwt", () => {
    cy.visit("/admin/settings/authentication/jwt");

    H.typeAndBlurUsingLabel(
      /JWT Identity Provider URI/i,
      "https://example.test",
    );
    cy.button("Set up key").click();
    H.modal().within(() => {
      cy.button("Create").click();
    });
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    H.goToAuthOverviewPage();

    cy.findByTestId("jwt-setting").findByText("Active").should("exist");
  });

  it("should save the group mapping mode and the mappings and keep them after a reload", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    selectJwtGroupMappingMode("Manual");
    addMapping("cn=People1", ["data", "nosql"]);

    cy.reload();
    jwtGroupMappingSection()
      .findByRole("radio", { name: "Manual" })
      .should("be.checked");
    mappingRow("cn=People1").should("contain", "data, nosql");

    cy.log(
      "Switching to automatic asks for confirmation and deletes the mappings",
    );
    selectJwtGroupMappingMode("Automatic");
    H.modal().button("Delete mappings and switch").click();
    cy.wait("@updateSettings").its("request.body").should("deep.equal", {
      "jwt-group-sync": true,
      "jwt-group-mappings": {},
    });

    cy.reload();
    jwtGroupMappingSection()
      .findByRole("radio", { name: "Automatic" })
      .should("be.checked");
    selectJwtGroupMappingMode("Manual");
    jwtGroupMappingSection()
      .findByText("Add at least one mapping to use manual group mapping")
      .should("be.visible");
  });
});

describe(
  "scenarios > admin > settings > SSO > LDAP",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("PUT", "/api/ldap/settings").as("updateLdapSettings");
    });

    it("should set up ldap with a valid port, even with a trailing space (metabase#13313, metabase#16173)", () => {
      cy.visit("/admin/settings/authentication/ldap");

      H.typeAndBlurUsingLabel(/LDAP Host/i, "localhost");
      H.typeAndBlurUsingLabel(/LDAP Port/i, "389 ");
      H.typeAndBlurUsingLabel("Username or DN", "cn=admin,dc=example,dc=org");
      H.typeAndBlurUsingLabel("Password", "adminpass");
      H.typeAndBlurUsingLabel(
        /User search base/i,
        "ou=users,dc=example,dc=org",
      );
      cy.button("Save and enable").click();
      cy.wait("@updateLdapSettings");
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.goToAuthOverviewPage();
      cy.findByTestId("ldap-setting").findByText("Active").should("exist");
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

    it("should allow user login on EE when LDAP is enabled", () => {
      H.activateToken("pro-self-hosted");
      H.setupLdap();
      // Only allowlisted directory attributes are synced, so name the ones this test checks.
      cy.request("PUT", "/api/setting/ldap-sync-user-attributes-allowlist", {
        value: "uid,homedirectory",
      });
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

describe("scenarios > admin > settings > SSO > OIDC", () => {
  const {
    groupMappingSwitch,
    mappingRow,
    toggleGroupMapping,
    addMapping,
    deleteMapping,
  } = groupMappingCardHelpers({
    sectionTestId: "oidc-group-mapping-section",
    nameLabel: "OIDC group name",
    switchRequestAlias: "updateProvider",
    switchValuePath: "group-sync.enabled",
    mappingsRequestAlias: "updateProvider",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.task("startMockOidcServer", { port: MOCK_IDP_PORT });
    cy.intercept("POST", "/api/ee/sso/oidc/check").as("checkConnection");
    cy.intercept("POST", "/api/ee/sso/oidc").as("createProvider");
    cy.intercept("PUT", "/api/ee/sso/oidc/*").as("updateProvider");
  });

  afterEach(() => {
    cy.task("stopMockOidcServer");
  });

  it("should check the connection, then save and enable a provider", () => {
    cy.visit("/admin/settings/authentication/oidc");
    enterOidcProviderSettings();

    cy.log("The check runs on its own against the identity provider");
    cy.button("Check connection").click();
    cy.wait("@checkConnection");
    H.undoToast().findByText("OIDC connection is valid").should("be.visible");

    cy.log("Saving creates the provider with group sync off");
    cy.button("Save and enable").click();
    cy.wait("@createProvider").its("request.body.key").should("equal", "okta");

    cy.log("The page switches to its configured state");
    cy.button("Success").should("be.visible");
    cy.findByLabelText(/^Key/).should("be.disabled");
    groupMappingSwitch().should("be.enabled").and("not.be.checked");
  });

  describe("Group mapping", () => {
    beforeEach(() => {
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      setupOidcProvider();
      cy.visit("/admin/settings/authentication/oidc");
    });

    it("should save the switch and the mappings through the provider and keep them after a reload", () => {
      toggleGroupMapping(true);
      addMapping("engineering", ["data", "nosql"]);

      cy.log("Everything comes back after a reload");
      cy.reload();
      groupMappingSwitch().should("be.checked");
      mappingRow("engineering").should("contain", "data, nosql");

      cy.log("Deleting a mapping takes its groups with it");
      deleteMapping(
        "engineering",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);

      cy.log("Turning group mapping off sticks");
      toggleGroupMapping(false);
      cy.reload();
      groupMappingSwitch().should("not.be.checked");
    });
  });
});

describe("scenarios > admin > settings > SSO > SAML", () => {
  const {
    groupMappingSwitch,
    mappingRow,
    toggleGroupMapping,
    addMapping,
    deleteMapping,
  } = groupMappingCardHelpers({
    sectionTestId: "saml-group-mapping-section",
    nameLabel: "SAML group name",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", /\/api\/setting$/).as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
    cy.intercept("PUT", "/api/saml/settings").as("updateSamlSettings");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSamlSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSamlSettings");
    cy.findByTestId("admin-layout-content")
      .findByText("Success")
      .should("exist");

    H.goToAuthOverviewPage();
    cy.findByTestId("saml-setting").findByText("Active").should("exist");
  });

  describe("Group mapping", () => {
    beforeEach(() => {
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      setupSaml();
      cy.visit("/admin/settings/authentication/saml");
    });

    it("should save the switch and the mappings on their own and the group attribute with the form", () => {
      toggleGroupMapping(true);
      addMapping("engineering", ["data", "nosql"]);

      cy.log("The group attribute saves with the page form");
      cy.findByLabelText(/Group attribute name/).type("memberOf");
      cy.button("Save changes").click();
      cy.wait("@updateSamlSettings");

      cy.log("Everything comes back after a reload");
      cy.reload();
      groupMappingSwitch().should("be.checked");
      mappingRow("engineering").should("contain", "data, nosql");
      cy.findByLabelText(/Group attribute name/).should(
        "have.value",
        "memberOf",
      );

      cy.log("Deleting a mapping takes its groups with it");
      deleteMapping(
        "engineering",
        /delete the groups/i,
        "Remove mapping and delete groups",
      );
      cy.wait(["@deleteGroup", "@deleteGroup"]);

      cy.log("Turning group mapping off sticks");
      toggleGroupMapping(false);
      cy.reload();
      groupMappingSwitch().should("not.be.checked");
    });
  });
});

const jwtGroupMappingSection = () => cy.findByTestId("jwt-group-schema");

// the segmented control keeps its radio inputs hidden, so the visible label takes the click
const selectJwtGroupMappingMode = (mode: string) => {
  // a click during a write is ignored, so wait for the control to be free first
  jwtGroupMappingSection()
    .contains("label", mode)
    .should("not.have.attr", "data-read-only");
  jwtGroupMappingSection().contains("label", mode).click();
};

const setupOidcProvider = () => {
  cy.request("PUT", "/api/setting/oidc-providers", {
    value: [
      {
        key: "okta",
        "login-prompt": "Sign in with Okta",
        "issuer-uri": OIDC_ISSUER_URI,
        "client-id": "metabase-client-id",
        "client-secret": "metabase-client-secret",
        enabled: true,
        scopes: ["openid", "email", "profile"],
      },
    ],
  });
};

const enterOidcProviderSettings = () => {
  H.typeAndBlurUsingLabel(/^Key/, "okta");
  H.typeAndBlurUsingLabel(/^Login prompt/, "Sign in with Okta");
  H.typeAndBlurUsingLabel(/^Issuer URI/, OIDC_ISSUER_URI);
  H.typeAndBlurUsingLabel(/^Client ID/, "metabase-client-id");
  H.typeAndBlurUsingLabel(/^Client secret/, "metabase-client-secret");
};

const enterSamlSettings = () => {
  getSamlCertificate().then((certificate) => {
    H.typeAndBlurUsingLabel(
      /SAML Identity Provider URL/i,
      "https://example.test",
    );
    H.typeAndBlurUsingLabel(
      /SAML Identity Provider Issuer/i,
      "https://example.test/issuer",
    );
    // paste this long value to not waste time typing
    cy.findByLabelText(/SAML Identity Provider Certificate/i)
      .click()
      .invoke("val", certificate);
    // do a little typing to invoke the blur event
    cy.findByLabelText(/SAML Identity Provider Certificate/i)
      .type("a{backspace}")
      .blur();
  });
};
