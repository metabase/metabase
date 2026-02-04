export const getMetabaseInstanceUrl = () =>
  Cypress.config("baseUrl") ?? "http://localhost:4000";

export const AUTH_PROVIDER_URL = "http://auth-provider/sso";
export const JWT_SHARED_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";
