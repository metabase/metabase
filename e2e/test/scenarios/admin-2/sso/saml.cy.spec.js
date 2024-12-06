import { H } from "e2e/support";

import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
} from "./shared/group-mappings-widget";
import {
  getSamlCertificate,
  getSuccessUi,
  getUserProvisioningInput,
  setupSaml,
} from "./shared/helpers";

H.describeEE("scenarios > admin > settings > SSO > SAML", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
    cy.intercept("PUT", "/api/setting").as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
    cy.intercept("PUT", "/api/saml/settings").as("updateSamlSettings");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSamlSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSamlSettings");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to update saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication/saml");

    H.typeAndBlurUsingLabel(/SAML Identity Provider URL/, "https://other.test");
    cy.button("Save changes").click();
    cy.wait("@updateSamlSettings");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable saml", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Pause").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Paused").should("exist");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Resume").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to reset saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    H.popover().findByText("Deactivate").click();
    H.modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getSamlCard().findByText("Set up").should("exist");
  });

  it("should allow the user to enable/disable user provisioning", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication/saml");

    getUserProvisioningInput().label.click();
    cy.button("Save changes").click();
    cy.wait("@updateSamlSettings");

    getSuccessUi().should("exist");
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
      crudGroupMappingsWidget("saml");
    });

    it("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", () => {
      checkGroupConsistencyAfterDeletingMappings("saml");
    });
  });
});

const getSamlCard = () => {
  return cy.findByText("SAML").parent().parent();
};

const enterSamlSettings = () => {
  getSamlCertificate().then(certificate => {
    H.typeAndBlurUsingLabel(
      /SAML Identity Provider URL/,
      "https://example.test",
    );
    H.typeAndBlurUsingLabel(/SAML Identity Provider Certificate/, certificate);
  });
};
