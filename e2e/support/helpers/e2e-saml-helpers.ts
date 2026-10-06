/**
  Requires the mock SAML IdP from e2e/test/scenarios/docker-compose.yml, which the Cypress
  runner starts for you:
    docker compose -f e2e/test/scenarios/docker-compose.yml up -d saml-idp

  Tests that sign in through it need `{ tags: "@external" }`, and a token with `sso-saml`.
 */

/** Published port of the `saml-idp` service. */
export const MOCK_SAML_IDP_URL = "http://localhost:8090";

/** Matches ENTITY_ID on the `saml-idp` service. */
const MOCK_SAML_ENTITY_ID = "https://saml.example.com/entityid";

/** Test-only keypair the IdP signs with; see e2e/test/scenarios/saml-keys. */
const MOCK_SAML_CERT_PATH = "e2e/test/scenarios/saml-keys/public.crt";

export const setupSaml = () => {
  cy.log("Set up mock SAML IdP");

  cy.readFile<string>(MOCK_SAML_CERT_PATH, "utf8").then((certificate) => {
    cy.request("PUT", "/api/setting", {
      "saml-enabled": true,
      "saml-identity-provider-uri": `${MOCK_SAML_IDP_URL}/api/saml/sso`,
      "saml-identity-provider-issuer": MOCK_SAML_ENTITY_ID,
      "saml-identity-provider-certificate": certificate,
      // mock-saml names its attributes after the raw profile keys, not the WS-Federation claim
      // URIs these settings default to, so they have to be mapped explicitly.
      "saml-attribute-email": "email",
      "saml-attribute-firstname": "firstName",
      "saml-attribute-lastname": "lastName",
    });
  });
};
