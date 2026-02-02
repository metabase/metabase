import fetchMock from "fetch-mock";

// ===== MOCK CONSTANTS =====

export const MOCK_INSTANCE_URL = "http://localhost";
export const MOCK_JWT_PROVIDER_URI = "http://test_uri/sso/metabase";
export const MOCK_SESSION_TOKEN_ID = "TEST_SESSION_TOKEN";
export const MOCK_VALID_JWT_RESPONSE = "TEST_JWT_TOKEN";
export const MOCK_API_KEY = "TEST_API_KEY";

/** Timestamps - exp set to 2032 to avoid token expiration during tests, iat set to past */
export const MOCK_TOKEN_EXP = 1965805007;
export const MOCK_TOKEN_IAT = 1609459200; // Jan 1, 2021

export const MOCK_FAILURE_URL = "http://oisin-is-really-cool/auth/sso";
export const MOCK_FAILURE_ERROR = "Fake unreachable server";
export const MOCK_AUTH_STATUS = "ok";

// ===== INTERFACES =====

interface BaseMockConfig {
  instanceUrl?: string;
  providerUri?: string;
  sessionToken?: string;
  exp?: number;
  iat?: number;
  failureUrl?: string;
  failureError?: string;
}

export type SamlMockConfig = BaseMockConfig;

export interface JwtMockConfig extends BaseMockConfig {
  providerResponse?: number | Record<string, any>;
}

// ===== MOCK SETUP FUNCTIONS =====

/**
 * Call setupMockSamlEndpoints() to make your tests think they're talking to a real SAML setup.
 *
 * When your code calls GET /auth/sso, it gets back a provider URL and "saml" method.
 * When your code POSTs to /auth/sso (simulating the SAML callback), it gets back a session token.
 *
 * For success testing: just call setupMockSamlEndpoints() and your auth will work normally.
 *
 * For failure testing: set failureUrl to whatever URL your test hits:
 * setupMockSamlEndpoints({ failureUrl: "http://localhost/auth/sso" })
 * Now when your code hits that URL, it gets a 500 error instead of auth data.
 *
 * For custom response data: override the tokens/timestamps:
 * setupMockSamlEndpoints({ sessionToken: "test-session-123", exp: 9999999999 })
 *
 * Returns mocks you can use to verify calls were made correctly.
 */
export const setupMockSamlEndpoints = ({
  instanceUrl = MOCK_INSTANCE_URL,
  providerUri = MOCK_JWT_PROVIDER_URI,
  sessionToken = MOCK_SESSION_TOKEN_ID,
  exp = MOCK_TOKEN_EXP,
  iat = MOCK_TOKEN_IAT,
  failureUrl = MOCK_FAILURE_URL,
  failureError = MOCK_FAILURE_ERROR,
}: SamlMockConfig = {}) => {
  const ssoUrl = new URL("/auth/sso", instanceUrl);

  const ssoInitMock = fetchMock.get(`begin:${ssoUrl.toString()}`, (call) => {
    const urlObj = new URL(call.url);
    const preferredMethod = urlObj.searchParams.get("preferred_method");

    if (preferredMethod === "jwt") {
      return {
        status: 400,
        body: { error: "JWT method not supported in SAML mock" },
      };
    }

    return {
      url: providerUri,
      method: "saml",
    };
  });

  const samlCallbackMock = fetchMock.post(`${instanceUrl}/auth/sso`, {
    body: {
      id: sessionToken,
      exp,
      iat,
    },
  });

  const failureMock = fetchMock.get(failureUrl, {
    status: 500,
    body: { error: failureError },
  });

  return {
    ssoInitMock,
    samlCallbackMock,
    failureMock,
  };
};

/**
 * Call setupSamlPopup() to mock the SAML popup flow that happens in the browser.
 *
 * In real SAML auth, your code calls openSamlLoginPopup() which opens a popup window,
 * the user logs in at their identity provider, then the popup sends a postMessage
 * back with the auth token and closes itself.
 *
 * This function mocks that entire popup interaction so your tests don't need real popups.
 * It mocks window.open() and automatically triggers the success postMessage on the next tick.
 *
 * Use this when testing code that calls openSamlLoginPopup() - the mocked popup will
 * automatically "complete" the auth flow and return the session token.
 *
 * Returns the mocked popup object so you can verify it was closed, etc.
 */
export const setupSamlPopup = () => {
  const popupMock = {
    closed: false,
    close: jest.fn(),
  };

  jest
    .spyOn(window, "open")
    .mockImplementation(() => popupMock as unknown as Window);

  // Wait until the next tick to simulate popup message
  process.nextTick(() => {
    const authData = createMockSdkSessionToken();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "SAML_AUTH_COMPLETE",
          authData,
        },
      }),
    );
  });

  return popupMock;
};

/**
 * Call setupMockJwtEndpoints() to mock a successful JWT login flow.
 * This sets up the 3-step process: get provider URL, fetch JWT from provider, validate JWT with Metabase.
 *
 * The default setup uses TEST_JWT_TOKEN and automatically mocks the validation endpoint for it.
 * If you need a different JWT token, you have two options:
 * 1. Use setupMockJwtEndpoints({ providerResponse: { jwt: "your-token" } }) and manually mock
 *    fetchMock.get("http://localhost/auth/sso?jwt=your-token", { your response })
 * 2. Keep the default and use TEST_JWT_TOKEN in your test assertions
 *
 * To test provider failures, return an error from providerResponse:
 * setupMockJwtEndpoints({ providerResponse: { status: 500, body: { error: "provider down" } } })
 *
 * To test network failures, set failureUrl to your request URL:
 * setupMockJwtEndpoints({ failureUrl: "http://localhost/auth/sso" })
 *
 * Returns mocks you can use to verify calls were made correctly.
 */
export const setupMockJwtEndpoints = ({
  instanceUrl = MOCK_INSTANCE_URL,
  providerUri = MOCK_JWT_PROVIDER_URI,
  providerResponse = { jwt: MOCK_VALID_JWT_RESPONSE },
  sessionToken = MOCK_SESSION_TOKEN_ID,
  exp = MOCK_TOKEN_EXP,
  iat = MOCK_TOKEN_IAT,
  failureUrl = MOCK_FAILURE_URL,
  failureError = MOCK_FAILURE_ERROR,
}: JwtMockConfig = {}) => {
  const ssoUrl = new URL("/auth/sso", instanceUrl);

  const ssoInitMock = fetchMock.get(
    (call) =>
      call.url.startsWith(ssoUrl.toString()) &&
      (call.url.includes("preferred_method=") || !call.url.includes("?")),
    (call) => {
      const urlObj = new URL(call.url);
      const preferredMethod = urlObj.searchParams.get("preferred_method");

      if (preferredMethod === "saml") {
        return {
          status: 400,
          body: { error: "SAML method not supported in JWT mock" },
        };
      }

      return {
        url: providerUri,
        method: "jwt",
      };
    },
  );

  const jwtProviderMock = fetchMock.get(`begin:${providerUri}`, (call) => {
    const urlObj = new URL(call.url);
    const responseParam = urlObj.searchParams.get("response");

    if (responseParam === "json") {
      return providerResponse;
    }

    // Return a default response or error for other cases
    return { status: 400, body: { error: "Invalid request" } };
  });

  const jwtValidationMock = fetchMock.get(
    `${instanceUrl}/auth/sso?jwt=${MOCK_VALID_JWT_RESPONSE}`,
    {
      body: {
        id: sessionToken,
        exp,
        iat,
      },
    },
  );
  const failureMock = fetchMock.get(failureUrl, {
    status: 500,
    body: { error: failureError },
  });
  return {
    ssoInitMock,
    jwtProviderMock,
    jwtValidationMock,
    failureMock,
  };
};

export const createMockSdkSessionToken = () => ({
  id: MOCK_SESSION_TOKEN_ID,
  exp: MOCK_TOKEN_EXP,
  iat: MOCK_TOKEN_IAT,
  status: MOCK_AUTH_STATUS,
});
