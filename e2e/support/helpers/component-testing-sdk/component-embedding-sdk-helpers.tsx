import type { SDKConfig } from "@metabase/embedding-sdk-react";
import { MetabaseProvider } from "@metabase/embedding-sdk-react";
import * as jose from "jose";
import type { JSX } from "react";

import { USERS } from "e2e/support/cypress_data";
import { signInAsAdminAndEnableEmbeddingSdkForE2e } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

export const METABASE_INSTANCE_URL = "http://localhost:4000";

export const JWT_PROVIDER_URL = "http://jtw-provider/sso";

export const JWT_SHARED_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const DEFAULT_SDK_PROVIDER_CONFIG = {
  authProviderUri: JWT_PROVIDER_URL,
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
};

export const sdkJwtSignIn = (user = USERS.admin) => {
  cy.intercept("GET", JWT_PROVIDER_URL, async req => {
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
      console.log("error", error);
      req.reply({
        statusCode: 500,
        body: error.message,
      });
    }
  }).as("jwtProvider");
};

export function mountSdkContent(
  children: JSX.Element,
  extraConfig: Partial<SDKConfig> = {},
) {
  cy.intercept("GET", "/api/user/current").as("getUser");

  cy.mount(
    <MetabaseProvider
      config={{ ...DEFAULT_SDK_PROVIDER_CONFIG, ...extraConfig }}
    >
      {children}
    </MetabaseProvider>,
  );

  cy.wait("@getUser").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}

export function signInAsAdminAndEnableEmbeddingSdkForComponentTests() {
  Cypress.config("baseUrl", METABASE_INSTANCE_URL);

  signInAsAdminAndEnableEmbeddingSdkForE2e();
}
