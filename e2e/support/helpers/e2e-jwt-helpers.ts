export const JWT_SHARED_SECRET = "0".repeat(64);

export const enableJwtAuth = () => {
  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": "http://localhost/sso/metabase",
    "jwt-shared-secret": JWT_SHARED_SECRET,
  });
};
