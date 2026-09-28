const { H } = cy;

import { groupMappingCardHelpers } from "./shared/group-mapping-card";

// the backend probes the identity provider on every provider write, so a mock one answers from this port
const MOCK_IDP_PORT = 6130;
const ISSUER_URI = `http://localhost:${MOCK_IDP_PORT}`;

const {
  groupMappingSection,
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

describe("scenarios > admin > settings > SSO > OIDC", () => {
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
    enterProviderSettings();

    cy.log("The check runs on its own against the identity provider");
    cy.button("Check connection").click();
    cy.wait("@checkConnection");
    H.undoToast().findByText("OIDC connection is valid").should("be.visible");

    cy.log("Saving checks again and creates the provider with group sync off");
    cy.button("Save and enable").click();
    cy.wait("@checkConnection");
    cy.wait("@createProvider")
      .its("request.body")
      .should((body) => {
        expect(body.key).to.equal("okta");
        expect(body["issuer-uri"]).to.equal(ISSUER_URI);
        expect(body["group-sync"]).to.deep.equal({
          enabled: false,
          "group-attribute": "groups",
          "group-mappings": {},
        });
      });

    cy.log("The page switches to its configured state");
    cy.button("Save changes").should("be.visible");
    cy.findByLabelText("Key").should("be.disabled");
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
      groupMappingSwitch().should("be.checked");

      cy.log("Turning group mapping off hides the mappings and sticks");
      toggleGroupMapping(false);
      groupMappingSection()
        .findByText("Manual group mappings")
        .should("not.exist");
      cy.reload();
      groupMappingSwitch().should("not.be.checked");
    });
  });
});

// writing the setting directly skips the connection check, so the page starts configured
const setupOidcProvider = () => {
  cy.request("PUT", "/api/setting/oidc-providers", {
    value: [
      {
        key: "okta",
        "login-prompt": "Sign in with Okta",
        "issuer-uri": ISSUER_URI,
        "client-id": "metabase-client-id",
        "client-secret": "metabase-client-secret",
        enabled: true,
        scopes: ["openid", "email", "profile"],
      },
    ],
  });
};

const enterProviderSettings = () => {
  H.typeAndBlurUsingLabel("Key", "okta");
  H.typeAndBlurUsingLabel("Login prompt", "Sign in with Okta");
  H.typeAndBlurUsingLabel("Issuer URI", ISSUER_URI);
  H.typeAndBlurUsingLabel("Client ID", "metabase-client-id");
  H.typeAndBlurUsingLabel("Client secret", "metabase-client-secret");
};
