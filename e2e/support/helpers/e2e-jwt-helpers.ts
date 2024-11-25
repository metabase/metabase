export const JWT_SHARED_SECRET = "0".repeat(64);

export const enableJwtAuth = () => {
  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": Cypress.config().baseUrl,
    "jwt-shared-secret": JWT_SHARED_SECRET,
  });
};
