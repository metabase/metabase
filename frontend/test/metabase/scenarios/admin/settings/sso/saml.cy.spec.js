import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
  popover,
} from "__support__/e2e/helpers";

describeEE("scenarios > admin > settings > SSO > SAML", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting/*").as("updateSetting");
    cy.intercept("PUT", "/api/setting").as("updateSettings");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSAMLSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSAMLCard().findByText("Active").should("exist");
  });

  it("should allow to update saml settings", () => {
    setupSAML();
    cy.visit("/admin/settings/authentication/saml");

    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://other.test");
    cy.button("Save changes").click();
    cy.wait("@updateSettings");
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    getSAMLCard().findByText("Active").should("exist");
  });

  it("should allow to disable saml", () => {
    setupSAML();
    cy.visit("/admin/settings/authentication");

    getSAMLCard().icon("ellipsis").click();
    popover().findByText("Pause").click();
    cy.wait("@updateSetting");

    getSAMLCard().findByText("Paused").should("exist");
  });
});

const getSAMLCard = () => {
  return cy.findByText("SAML").parent();
};

const getSAMLCertificate = () => {
  return cy.readFile("test_resources/sso/auth0-public-idp.cert", "utf8");
};

const setupSAML = () => {
  getSAMLCertificate().then(certificate => {
    cy.request("PUT", "/api/setting", {
      "saml-enabled": true,
      "saml-identity-provider-uri": "https://example.test",
      "saml-identity-provider-certificate": certificate,
    });
  });
};

const enterSAMLSettings = () => {
  getSAMLCertificate().then(certificate => {
    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://example.test");
    typeAndBlurUsingLabel("SAML Identity Provider Certificate", certificate);
  });
};
