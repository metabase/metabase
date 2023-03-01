import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
  popover,
  modal,
} from "e2e/support/helpers";

describeEE("scenarios > admin > settings > SSO > SAML", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting").as("updateSettings");
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSamlSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to update saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication/saml");

    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://other.test");
    cy.button("Save changes").click();
    cy.wait("@updateSettings");
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to disable and enable saml", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    popover().findByText("Pause").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Paused").should("exist");

    getSamlCard().icon("ellipsis").click();
    popover().findByText("Resume").click();
    cy.wait("@updateSetting");
    getSamlCard().findByText("Active").should("exist");
  });

  it("should allow to reset saml settings", () => {
    setupSaml();
    cy.visit("/admin/settings/authentication");

    getSamlCard().icon("ellipsis").click();
    popover().findByText("Deactivate").click();
    modal().button("Deactivate").click();
    cy.wait("@updateSettings");

    getSamlCard().findByText("Set up").should("exist");
  });
});

const getSamlCard = () => {
  return cy.findByText("SAML").parent().parent();
};

const getSamlCertificate = () => {
  return cy.readFile("test_resources/sso/auth0-public-idp.cert", "utf8");
};

const setupSaml = () => {
  getSamlCertificate().then(certificate => {
    cy.request("PUT", "/api/setting", {
      "saml-enabled": true,
      "saml-identity-provider-uri": "https://example.test",
      "saml-identity-provider-certificate": certificate,
    });
  });
};

const enterSamlSettings = () => {
  getSamlCertificate().then(certificate => {
    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://example.test");
    typeAndBlurUsingLabel("SAML Identity Provider Certificate", certificate);
  });
};
