import {
  describeEE,
  modal,
  popover,
  restore,
  setTokenFeatures,
  typeAndBlurUsingLabel,
} from "e2e/support/helpers";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
} from "./shared/group-mappings-widget";
import { getSuccessUi, getUserProvisioningInput } from "./shared/helpers";

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
    enableJwtAuth();
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

  it("should allow the user to enable/disable user provisioning", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication/jwt");

    getUserProvisioningInput().label.click();
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    getSuccessUi().should("exist");
  });

  it("should allow to reset jwt settings", () => {
    enableJwtAuth();
    cy.visit("/admin/settings/authentication");

    getJwtCard().icon("ellipsis").click();
    popover().findByText("Deactivate").click();
    modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getJwtCard().findByText("Set up").should("exist");
  });

  it("should allow to regenerate the jwt key and save the settings", () => {
    enableJwtAuth();
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

const enterJwtSettings = () => {
  typeAndBlurUsingLabel(/JWT Identity Provider URI/, "https://example.test");
  cy.button("Generate key").click();
};
