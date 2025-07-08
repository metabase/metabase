import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  type MetabaseProviderProps,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk/components/public";

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
      fetchMock.lastCall(`${MOCK_JWT_PROVIDER_URI}?response=json`),
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
      fetchMock.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
    ).toHaveLength(1);

    rerender(
      <MetabaseProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(
      fetchMock.calls(`${MOCK_JWT_PROVIDER_URI}?response=json`),
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

    expect(getLastAuthProviderApiCall()![1]).toMatchObject({
      credentials: "include",
      method: "GET",
    });

    await waitForRequest(() => getLastUserApiCall());
    expect(getLastUserApiCall()![1]).toMatchObject({
      headers: { "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID] },
    });

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()![1]).toMatchObject({
      headers: { "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID] },
    });
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

    expect(getLastUserApiCall()![1]).toMatchObject({
      headers: {
        "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID],
      },
    });

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()![1]).toMatchObject({
      headers: {
        "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID],
      },
    });
  });

  it("should include the subpath when requesting the SSO endpoint", async () => {
    // we can't use the usual mocks here as they use mocks that don't expect the subpath
    const instanceUrlWithSubpath = `${MOCK_INSTANCE_URL}/subpath`;

    fetchMock.mock(`${instanceUrlWithSubpath}/auth/sso`, {
      status: 200,
      body: { url: MOCK_JWT_PROVIDER_URI, method: "jwt" },
    });

    fetchMock.mock(`${MOCK_JWT_PROVIDER_URI}?response=json`, {
      status: 200,
      body: {
        jwt: MOCK_VALID_JWT_RESPONSE,
      },
    });

    fetchMock.mock(
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

    const expectedSsoUrl = `${instanceUrlWithSubpath}/auth/sso`;

    // One call is for the initial "configuration", to know which sso method to use
    // The second call is the actual "login"
    expect(
      fetchMock.calls((url) => url.startsWith(expectedSsoUrl)),
    ).toHaveLength(2);
  });
});
