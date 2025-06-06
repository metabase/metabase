import { loginCache } from "e2e/support/commands/user/authentication";

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
