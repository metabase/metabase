import * as jose from "jose";

import { loginCache } from "e2e/support/commands/user/authentication";
import { USERS } from "e2e/support/cypress_data";
import {
  AUTH_PROVIDER_URL,
  JWT_SHARED_SECRET,
  activateToken,
  restore,
  updateSetting,
} from "e2e/support/helpers";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

export const getSignedJwtForUser = async ({
  user = USERS.admin,
  expiredInSeconds = 60 * 10, // 10 minutes expiration,
}: {
  user?: { email: string; first_name: string; last_name: string };
  expiredInSeconds?: number;
}) => {
  const secret = new TextEncoder().encode(JWT_SHARED_SECRET);

  return new jose.SignJWT({
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    exp: Math.round(Date.now() / 1000) + expiredInSeconds,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret);
};

export const mockAuthProviderAndJwtSignIn = (
  user = USERS.admin,
  {
    jwt,
    waitForPromise,
  }: { jwt?: string; waitForPromise?: () => Promise<any> } = {},
) => {
  cy.intercept("GET", `${AUTH_PROVIDER_URL}**`, async (req) => {
    const p = waitForPromise ? waitForPromise() : Promise.resolve();

    await p;

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

      jwt = jwt || (await getSignedJwtForUser({ user }));

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
  restore();

  cy.signInAsAdmin();
  activateToken("bleeding-edge");
  enableJwtAuth();
  cy.request("PUT", "/api/setting", {
    "enable-embedding-sdk": true,
  });
}

export function signInAsAdminAndSetupGuestEmbedding({
  token,
}: {
  token: "starter" | "pro-cloud" | "bleeding-edge";
}) {
  restore();

  cy.signInAsAdmin();

  activateToken(token);
  updateSetting("embedding-secret-key", JWT_SHARED_SECRET);
}

const MOCK_SAML_IDP_URI = "https://example.test/saml";

export function enableSamlAuth() {
  cy.readFile<string>("test_resources/sso/auth0-public-idp.cert", "utf8").then(
    (certificate) => {
      cy.request("PUT", "/api/setting", {
        "saml-enabled": true,
        "saml-identity-provider-uri": MOCK_SAML_IDP_URI,
        "saml-identity-provider-certificate": certificate,
        "saml-identity-provider-issuer": "https://example.test/issuer",
      });
    },
  );
}

export function mockAuthSsoEndpointForSamlAuthProvider() {
  cy.intercept("GET", "/auth/sso", (req) => {
    req.reply({
      statusCode: 200,
      body: {
        method: "saml",
        url: MOCK_SAML_IDP_URI,
        hash: "test-hash",
      },
    });
  });
}

export function stubWindowOpenForSamlPopup({
  isUserValid = true,
}: {
  isUserValid?: boolean;
} = {}) {
  cy.window().then((win) => {
    const popup = {
      closed: false,
      close: () => {
        popup.closed = true;
      },
    };

    // stub `window.open(IDP_URI, ...)` for the SAML popup
    cy.stub(win, "open")
      .withArgs(MOCK_SAML_IDP_URI)
      .callsFake(() => {
        setTimeout(() => {
          // Simulate the SAML_AUTH_COMPLETE message
          win.dispatchEvent(
            new MessageEvent("message", {
              data: {
                type: "SAML_AUTH_COMPLETE",

                // The snapshot creator populates the cache with a real session token.
                // Without this, we get an "invalid user" error as we need a valid session.
                authData: {
                  id: isUserValid
                    ? loginCache.normal?.sessionId
                    : "invalid-session-token",
                  exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
                },
              },
              origin: "*",
            }),
          );
          popup.close();
        }, 100); // simulate async delay

        return popup;
      });
  });
}
