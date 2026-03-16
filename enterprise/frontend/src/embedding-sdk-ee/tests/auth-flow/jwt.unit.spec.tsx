import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  MOCK_INSTANCE_URL,
  MOCK_JWT_PROVIDER_URI,
  MOCK_SESSION_TOKEN_ID,
  MOCK_VALID_JWT_RESPONSE,
  setupMockJwtEndpoints,
} from "embedding-sdk-bundle/test/mocks/sso";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { defineMetabaseAuthConfig } from "embedding-sdk-shared/lib/define-metabase-auth-config";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { setupEmbeddingSdkEnterprisePlugins } from "../support";

import { setup as baseSetup } from "./setup";

const setup = ({
  authConfig,
  locale,
}: Pick<MetabaseProviderProps, "authConfig" | "locale">) => {
  setupMockJwtEndpoints();

  const getFirstSsoDiscoveryCall = () => {
    // This is `/auth/sso` or `auth/sso?preferred_method=...`
    // that returns the method (jwt/saml) and the url of the sso provider
    // `auth/sso?jwt=...` is the second call and should be excluded from this
    return fetchMock.callHistory
      .calls()
      .filter(
        (call) =>
          new URL(call.url).pathname === "/auth/sso" &&
          !new URL(call.url).searchParams.has("jwt"),
      );
  };

  return {
    ...baseSetup({ authConfig, locale }),
    getLastAuthProviderApiCall: () =>
      fetchMock.callHistory.lastCall(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    getFirstSsoDiscoveryCall,
  };
};

describe("Auth Flow - JWT", () => {
  beforeEach(() => {
    setupEmbeddingSdkEnterprisePlugins();
  });

  it("should initialize the auth flow only once, not on rerenders", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
    });

    const { rerender, getFirstSsoDiscoveryCall } = setup({ authConfig });

    await waitForLoaderToBeRemoved();
    expect(
      fetchMock.callHistory.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    ).toHaveLength(1);

    rerender(
      <ComponentProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </ComponentProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(
      fetchMock.callHistory.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    ).toHaveLength(1);

    expect(getFirstSsoDiscoveryCall()).toHaveLength(1);

    const loader = screen.queryByTestId("loading-indicator");
    expect(loader).not.toBeInTheDocument();

    expect(
      // this is just something we know it's on the screen when everything is ok
      screen.getByTestId("query-visualization-root"),
    ).toBeInTheDocument();
  });

  it("should retrieve the session from the authProviderUri and send it as 'X-Metabase-Session' header", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
    });

    const {
      getLastAuthProviderApiCall,
      getLastCardQueryApiCall,
      getLastUserApiCall,
    } = setup({ authConfig });

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastAuthProviderApiCall()?.options).toMatchObject({
      credentials: "include",
      method: /GET/i,
    });

    await waitForRequest(() => getLastUserApiCall());
    expect(getLastUserApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );
  });

  it("should skip the initial /auth/sso request when jwtProviderUri is provided", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      jwtProviderUri: MOCK_JWT_PROVIDER_URI,
    });

    const { getLastAuthProviderApiCall, getFirstSsoDiscoveryCall } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastAuthProviderApiCall());

    expect(getFirstSsoDiscoveryCall()).toHaveLength(0);
  });

  it("should use `fetchRequestToken` if provided", async () => {
    const customFetchFunction = jest.fn().mockImplementation(() => ({
      jwt: MOCK_VALID_JWT_RESPONSE,
    }));

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      preferredAuthMethod: "jwt",
      fetchRequestToken: customFetchFunction,
    });

    const {
      getLastCardQueryApiCall,
      getLastUserApiCall,
      getFirstSsoDiscoveryCall,
    } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastUserApiCall());

    expect(customFetchFunction).toHaveBeenCalled();

    expect(getFirstSsoDiscoveryCall()).toHaveLength(1);

    expect(getLastUserApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );
  });

  it('should not render usage problem popover saying JWT is missing "exp" claim when then token is being fetched', async () => {
    const customFetchFunction = jest.fn().mockImplementation(() => ({
      jwt: MOCK_VALID_JWT_RESPONSE,
    }));

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      preferredAuthMethod: "jwt",
      fetchRequestToken: customFetchFunction,
    });

    setup({ authConfig });

    expect(
      screen.queryByTestId("sdk-usage-problem-indicator"),
    ).not.toBeInTheDocument();
  });

  it("should include the subpath when requesting the SSO endpoint", async () => {
    // we can't use the usual mocks here as they use mocks that don't expect the subpath
    const instanceUrlWithSubpath = `${MOCK_INSTANCE_URL}/subpath`;

    // Set up base URL mocks FIRST, before subpath-specific mocks
    // This test doesn't use the shared setup() function, so it needs its own mocks
    setupCurrentUserEndpoint(createMockUser());
    setupPropertiesEndpoints(createMockSettings());

    fetchMock.get(`${instanceUrlWithSubpath}/auth/sso`, {
      status: 200,
      body: { url: MOCK_JWT_PROVIDER_URI, method: "jwt" },
    });

    fetchMock.get(`${MOCK_JWT_PROVIDER_URI}?response=json`, {
      status: 200,
      body: {
        jwt: MOCK_VALID_JWT_RESPONSE,
      },
    });

    fetchMock.get(
      `${instanceUrlWithSubpath}/auth/sso?jwt=${MOCK_VALID_JWT_RESPONSE}`,
      {
        status: 200,
        body: {
          id: MOCK_SESSION_TOKEN_ID,
          user: { id: 1 },
        },
      },
    );

    fetchMock.get(`${instanceUrlWithSubpath}/api/user/current`, {
      status: 200,
      body: createMockUser(),
    });

    fetchMock.get(`${instanceUrlWithSubpath}/api/session/properties`, {
      status: 200,
      body: createMockSettings(),
    });

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: instanceUrlWithSubpath,
    });

    renderWithProviders(
      <ComponentProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </ComponentProvider>,
    );

    await waitForLoaderToBeRemoved();

    // One call is for the initial "configuration", to know which sso method to use
    // The second call is the actual "login"
    expect(
      fetchMock.callHistory.calls(`begin:${instanceUrlWithSubpath}/auth/sso`),
    ).toHaveLength(2);
  });

  it("should support relative URLs for jwtProviderUri", async () => {
    const relativeJwtProviderUri = "/api/sso";

    setupCurrentUserEndpoint(createMockUser());
    setupPropertiesEndpoints(createMockSettings());

    // Mock the relative JWT provider endpoint (will be resolved to window.location.origin)
    fetchMock.get(
      `${window.location.origin}${relativeJwtProviderUri}?response=json`,
      {
        status: 200,
        body: { jwt: MOCK_VALID_JWT_RESPONSE },
      },
    );

    // Mock the Metabase SSO validation endpoint
    fetchMock.get(
      `${MOCK_INSTANCE_URL}/auth/sso?jwt=${MOCK_VALID_JWT_RESPONSE}`,
      {
        status: 200,
        body: {
          id: MOCK_SESSION_TOKEN_ID,
          exp: 1965805007,
          iat: 1609459200,
        },
      },
    );

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      jwtProviderUri: relativeJwtProviderUri,
    });

    renderWithProviders(
      <ComponentProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </ComponentProvider>,
    );

    await waitForLoaderToBeRemoved();

    // Verify the relative URL was correctly resolved and called
    expect(
      fetchMock.callHistory.calls(
        `${window.location.origin}${relativeJwtProviderUri}?response=json`,
      ),
    ).toHaveLength(1);
  });
});
