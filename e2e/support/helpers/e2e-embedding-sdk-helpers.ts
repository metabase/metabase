import * as jose from "jose";

import {
  AUTH_PROVIDER_URL,
  INJECTED_ENTITY_ID_GETTER_FUNCTION_NAME,
  METABASE_INSTANCE_URL,
} from "e2e/support/constants/embedding-sdk";
import { USERS } from "e2e/support/cypress_data";
import { setTokenFeatures } from "e2e/support/helpers/e2e-enterprise-helpers";
import {
  JWT_SHARED_SECRET,
  enableJwtAuth,
} from "e2e/support/helpers/e2e-jwt-helpers";
import { restore } from "e2e/support/helpers/e2e-setup-helpers";
import type { InjectedEntityIdGetterParameters } from "e2e/support/types/embedding-sdk";

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

export const mockAuthProviderAndJwtSignIn = (user = USERS.admin) => {
  // We have to use wildcard to intercept cases with query parameters
  cy.intercept("GET", `${AUTH_PROVIDER_URL}*`, async req => {
    try {
      const secret = new TextEncoder().encode(JWT_SHARED_SECRET);
      const token = await new jose.SignJWT({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
      })
        .setProtectedHeader({ alg: "HS256" })

        .sign(secret);

      const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;

      const response = await fetch(ssoUrl, { method: "GET" });
      const session = await response.text();

      req.reply({
        statusCode: 200,
        body: session,
      });
    } catch (error: any) {
      console.warn("SDK auth error:", error);
      req.reply({
        statusCode: 500,
        body: error.message,
      });
    }
  }).as("jwtProvider");
};

export const getSdkRoot = () =>
  cy.get("#metabase-sdk-root").should("be.visible");

export function createInjectedEntityIdGetter(
  callback: (parameters: InjectedEntityIdGetterParameters) => unknown,
) {
  return (window: Cypress.AUTWindow) => {
    (window as any)[INJECTED_ENTITY_ID_GETTER_FUNCTION_NAME] = (
      parameters: InjectedEntityIdGetterParameters,
    ) => {
      return callback(parameters);
    };
  };
}
