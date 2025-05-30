import { AUTH_PROVIDER_URL } from "./embedding-sdk-helpers/constants";

export const JWT_SHARED_SECRET = "0".repeat(64);

export const enableJwtAuth = () => {
  cy.request("PUT", "/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": AUTH_PROVIDER_URL,
    "jwt-shared-secret": JWT_SHARED_SECRET,
  });
};
