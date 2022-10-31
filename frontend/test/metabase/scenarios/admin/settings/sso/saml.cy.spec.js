import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
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
    cy.findByRole("switch", { name: "SAML" }).should("be.checked");
  });

  it("should allow to update saml settings", () => {
    setupSAML();
    cy.visit("/admin/settings/authentication/saml");

    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://other.test");
    cy.button("Save changes").click();
    cy.wait("@updateSettings");
    cy.findByText("Success").should("exist");

    cy.findAllByRole("link", { name: "Authentication" }).first().click();
    cy.findByRole("switch", { name: "SAML" }).should("be.checked");
  });

  it("should allow to enable and disable saml via the toggle", () => {
    setupSAML();
    cy.visit("/admin/settings/authentication");

    cy.findByRole("switch", { name: "SAML" }).click();
    cy.wait("@updateSetting");
    cy.findByText("Saved").should("exist");
    cy.findByRole("switch", { name: "SAML" }).should("not.be.checked");

    cy.findByRole("switch", { name: "SAML" }).click();
    cy.wait("@updateSetting");
    cy.findByText("Saved").should("exist");
    cy.findByRole("switch", { name: "SAML" }).should("be.checked");
  });
});

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
