import * as jose from "jose";

import { USERS } from "e2e/support/cypress_data";
import {
  AUTH_PROVIDER_URL,
  JWT_SHARED_SECRET,
  METABASE_INSTANCE_URL,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

export const mockAuthProviderAndJwtSignIn = (user = USERS.admin) => {
  cy.intercept("GET", `${AUTH_PROVIDER_URL}**`, async (req) => {
    try {
      const url = new URL(req.url);
      const responseParam = url.searchParams.get("response");

      // Return error if response is not json
      if (responseParam !== "json") {
        req.reply({
          statusCode: 400,
          body: { error: "Invalid response parameter. Expected response=json" },
        });
        return;
      }

      const secret = new TextEncoder().encode(JWT_SHARED_SECRET);
      const jwt = await new jose.SignJWT({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secret);

      req.reply({
        statusCode: 200,
        body: { jwt },
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

export function signInAsAdminAndEnableEmbeddingSdk() {
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);

  restore();

  cy.signInAsAdmin();
  setTokenFeatures("all");
  enableJwtAuth();
  cy.request("PUT", "/api/setting", {
    "enable-embedding-sdk": true,
  });
}
