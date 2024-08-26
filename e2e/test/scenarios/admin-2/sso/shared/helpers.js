export function getUserProvisioningInput() {
  return {
    label: cy
      .findByTestId("admin-layout-content")
      .findByText("User Provisioning"),
    input: cy
      .findByTestId("admin-layout-content")
      .findByLabelText("User Provisioning"),
  };
}

export function getSuccessUi() {
  return cy.findByTestId("admin-layout-content").findByText("Success");
}

export const getSamlCertificate = () => {
  return cy.readFile("test_resources/sso/auth0-public-idp.cert", "utf8");
};

export const setupSaml = () => {
  getSamlCertificate().then(certificate => {
    cy.request("PUT", "/api/setting", {
      "saml-enabled": true,
      "saml-identity-provider-uri": "https://example.test",
      "saml-identity-provider-certificate": certificate,
    });
  });
};
