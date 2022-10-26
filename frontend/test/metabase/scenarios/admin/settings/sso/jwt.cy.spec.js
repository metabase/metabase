import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
  modal,
} from "__support__/e2e/helpers";

describeEE("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting").as("updateSettings");
  });

  it("should allow to save and enable jwt", () => {
    cy.visit("/admin/settings/authentication/jwt");

    enterJWTSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    cy.findAllByRole("link", { name: "Authentication" }).first().click();

    cy.findByRole("switch", { name: "JWT" }).should("be.checked");
  });

  it("should allow to save but not enable jwt", () => {
    cy.visit("/admin/settings/authentication/jwt");

    enterJWTSettings();
    cy.button("Save but don't enable").click();
    cy.wait("@updateSettings");
    cy.findAllByRole("link", { name: "Authentication" }).first().click();

    cy.findByRole("switch", { name: "JWT" }).should("not.be.checked");
  });

  it("should allow to regenerate the jwt key and save the settings", () => {
    setupJWT();
    cy.visit("/admin/settings/authentication/jwt");

    cy.button("Regenerate key").click();
    modal().button("Yes").click();
    cy.button("Save changes").click();
    cy.wait("@updateSettings");

    cy.findByText("Changes saved!").should("exist");
  });
});

const setupJWT = () => {
  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": "https://example.text",
    "jwt-shared-secret": "0".repeat(64),
  });
};

const enterJWTSettings = () => {
  typeAndBlurUsingLabel("JWT Identity Provider URI", "https://example.test");
  cy.button("Generate key").click();
};
