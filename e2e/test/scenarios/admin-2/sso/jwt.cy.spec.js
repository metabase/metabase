import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
  modal,
  popover,
  setTokenFeatures,
} from "e2e/support/helpers";

import {
  crudGroupMappingsWidget,
  checkGroupConsistencyAfterDeletingMappings,
} from "./shared/group-mappings-widget";

describeEE("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.intercept("PUT", "/api/setting").as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
  });

  it("should allow to save and enable jwt", () => {
    cy.visit("/admin/settings/authentication/jwt");

    enterJwtSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    cy.findAllByRole("link", { name: "Authentication" }).first().click();

    getJwtCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable jwt", () => {
    setupJwt();
    cy.visit("/admin/settings/authentication");

    getJwtCard().icon("ellipsis").click();
    popover().findByText("Pause").click();
    cy.wait("@updateSetting");
    getJwtCard().findByText("Paused").should("exist");

    getJwtCard().icon("ellipsis").click();
    popover().findByText("Resume").click();
    cy.wait("@updateSetting");
    getJwtCard().findByText("Active").should("exist");
  });

  it("should allow to reset jwt settings", () => {
    setupJwt();
    cy.visit("/admin/settings/authentication");

    getJwtCard().icon("ellipsis").click();
    popover().findByText("Deactivate").click();
    modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getJwtCard().findByText("Set up").should("exist");
  });

  it("should allow to regenerate the jwt key and save the settings", () => {
    setupJwt();
    cy.visit("/admin/settings/authentication/jwt");

    cy.button("Regenerate key").click();
    modal().within(() => {
      cy.findByText("Regenerate JWT signing key?").should("exist");
      cy.findByText(
        "This will cause existing tokens to stop working until the identity provider is updated with the new key.",
      ).should("exist");
      cy.button("Yes").click();
    });
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success").should("exist");
  });

  describe("Group Mappings Widget", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/setting").as("getSettings");
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
      cy.intercept("DELETE", "/api/permissions/group/*").as("deleteGroup");
      cy.intercept("PUT", "/api/permissions/membership/*/clear").as(
        "clearGroup",
      );
    });

    it("should allow deleting mappings along with deleting, or clearing users of, mapped groups", () => {
      crudGroupMappingsWidget("jwt");
    });

    it("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", () => {
      checkGroupConsistencyAfterDeletingMappings("jwt");
    });
  });
});

const getJwtCard = () => {
  return cy.findByText("JWT").parent().parent();
};

const setupJwt = () => {
  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": "https://example.text",
    "jwt-shared-secret": "0".repeat(64),
  });
};

const enterJwtSettings = () => {
  typeAndBlurUsingLabel(/JWT Identity Provider URI/, "https://example.test");
  cy.button("Generate key").click();
};
