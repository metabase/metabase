import {
  restore,
  describeEE,
  typeAndBlurUsingLabel,
} from "__support__/e2e/helpers";

describeEE("scenarios > admin > settings > SSO > SAML", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/setting").as("updateSettings");
  });

  it("should allow to save and enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSAMLSettings();
    cy.button("Save and enable").click();
    cy.wait("@updateSettings");
    cy.findAllByRole("link", { name: "Authentication" }).first().click();

    cy.findByRole("switch", { name: "SAML" }).should("be.checked");
  });

  it("should allow to save but not enable saml", () => {
    cy.visit("/admin/settings/authentication/saml");

    enterSAMLSettings();
    cy.button("Save but don't enable").click();
    cy.wait("@updateSettings");
    cy.findAllByRole("link", { name: "Authentication" }).first().click();

    cy.findByRole("switch", { name: "SAML" }).should("not.be.checked");
  });
});

const getSAMLCertificate = () => {
  return cy.readFile("test_resources/sso/auth0-public-idp.cert", "utf8");
};

const enterSAMLSettings = () => {
  getSAMLCertificate().then(certificate => {
    typeAndBlurUsingLabel("SAML Identity Provider URL", "https://example.test");
    typeAndBlurUsingLabel("SAML Identity Provider Certificate", certificate);
  });
};
