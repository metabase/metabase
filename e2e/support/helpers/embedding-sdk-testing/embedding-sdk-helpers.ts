import * as jose from "jose";

import { USERS } from "e2e/support/cypress_data";
import {
  AUTH_PROVIDER_URL,
  JWT_SHARED_SECRET,
  METABASE_INSTANCE_URL,
} from "e2e/support/helpers";
import { signInAsAdminAndEnableEmbeddingSdkForE2e } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

export const mockAuthProviderAndJwtSignIn = (user = USERS.admin) => {
  cy.intercept("GET", AUTH_PROVIDER_URL, async (req) => {
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

export function signInAsAdminAndEnableEmbeddingSdk() {
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);

  signInAsAdminAndEnableEmbeddingSdkForE2e();
}
