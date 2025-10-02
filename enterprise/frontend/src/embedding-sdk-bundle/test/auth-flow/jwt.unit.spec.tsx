import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  type MetabaseProviderProps,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk-bundle/components/public";

import {
  MOCK_INSTANCE_URL,
  MOCK_JWT_PROVIDER_URI,
  MOCK_SESSION_TOKEN_ID,
  MOCK_VALID_JWT_RESPONSE,
  setupMockJwtEndpoints,
} from "../mocks/sso";

import { setup as baseSetup } from "./setup";

const setup = ({
  authConfig,
  locale,
}: Pick<MetabaseProviderProps, "authConfig" | "locale">) => {
  setupMockJwtEndpoints();
  return {
    ...baseSetup({ authConfig, locale }),
    getLastAuthProviderApiCall: () =>
      fetchMock.callHistory.lastCall(`${MOCK_JWT_PROVIDER_URI}?response=json`),
  };
};

describe("Auth Flow - JWT", () => {
  it("should initialize the auth flow only once, not on rerenders", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
    });

    const { rerender } = setup({ authConfig });

    await waitForLoaderToBeRemoved();
    expect(
      fetchMock.callHistory.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    ).toHaveLength(1);

    rerender(
      <MetabaseProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(
      fetchMock.callHistory.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    ).toHaveLength(1);

    expect(screen.queryByText("Initializing...")).not.toBeInTheDocument();

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

  it("should use `fetchRequestToken` if provided", async () => {
    const customFetchFunction = jest.fn().mockImplementation(() => ({
      jwt: MOCK_VALID_JWT_RESPONSE,
    }));

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      preferredAuthMethod: "jwt",
      fetchRequestToken: customFetchFunction,
    });

    const { getLastCardQueryApiCall, getLastUserApiCall } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastUserApiCall());

    expect(customFetchFunction).toHaveBeenCalled();

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

    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: instanceUrlWithSubpath,
    });

    renderWithProviders(
      <MetabaseProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );

    await waitForLoaderToBeRemoved();

    // One call is for the initial "configuration", to know which sso method to use
    // The second call is the actual "login"
    expect(
      fetchMock.callHistory.calls(`begin:${instanceUrlWithSubpath}/auth/sso`),
    ).toHaveLength(2);
  });
});
