import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
  modal,
  popover,
} from "e2e/support/helpers";

describeEE("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
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
    modal().button("Yes").click();
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    cy.findByText("Success").should("exist");
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
  typeAndBlurUsingLabel("JWT Identity Provider URI", "https://example.test");
  cy.button("Generate key").click();
};
