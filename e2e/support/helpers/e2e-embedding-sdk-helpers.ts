import { setTokenFeatures } from "e2e/support/helpers/e2e-enterprise-helpers";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";
import { restore } from "e2e/support/helpers/e2e-setup-helpers";

export const EMBEDDING_SDK_STORY_HOST = "http://localhost:6006/iframe.html";

export function signInAsAdminAndEnableEmbeddingSdkForE2e() {
  restore();

  cy.signInAsAdmin();
  setTokenFeatures("all");
  enableJwtAuth();
  cy.request("PUT", "/api/setting", {
    "enable-embedding-sdk": true,
  });
}

export const getSdkRoot = () =>
  cy.get("#metabase-sdk-root").should("be.visible");
