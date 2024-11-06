import { render, screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  StaticQuestion,
  defineEmbeddingSdkConfig,
} from "embedding-sdk/components/public";
import type { SDKConfig } from "embedding-sdk/types";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const METABASE_INSTANCE_URL = "path:"; // "path:" is used by our core app support server mocks
const AUTH_PROVIDER_URL = "http://auth-provider:3000/sso/metabase";
const MOCK_API_KEY = "mock-api-key";
const USER_CURRENT_URL = `${METABASE_INSTANCE_URL}/api/user/current`;
const MOCK_SESSION = {
  exp: Number.MAX_SAFE_INTEGER,
  iat: 1729760873,
  id: "5e03fb0a-2398-423f-98b3-0c4abaf0c47a",
};

const MOCK_CARD = createMockCard({ id: 1 });

const setup = (sdkConfig: SDKConfig) => {
  return render(
    <MetabaseProvider
      config={{
        ...sdkConfig,
      }}
    >
      <StaticQuestion questionId={1} />
    </MetabaseProvider>,
  );
};

const getLastUserApiCall = () => fetchMock.lastCall(USER_CURRENT_URL);
const getLastAuthProviderApiCall = () => fetchMock.lastCall(AUTH_PROVIDER_URL);
const getLastCardQueryApiCall = () =>
  fetchMock.lastCall(`${METABASE_INSTANCE_URL}/api/card/${MOCK_CARD.id}/query`);

describe("SDK auth flow", () => {
  beforeEach(() => {
    fetchMock.reset();
    fetchMock.get(AUTH_PROVIDER_URL, {
      status: 200,
      body: MOCK_SESSION,
    });

    setupPropertiesEndpoints(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          embedding_sdk: true,
        }),
      }),
    );

    setupCurrentUserEndpoint(createMockUser({ id: 1 }));

    setupCardEndpoints(MOCK_CARD);
    setupCardQueryEndpoints(MOCK_CARD, {} as any);
  });

  it("should initialize the auth flow only once, not on rerenders", async () => {
    const sdkConfig = defineEmbeddingSdkConfig({
      metabaseInstanceUrl: METABASE_INSTANCE_URL,
      jwtProviderUri: AUTH_PROVIDER_URL,
    });

    const { rerender } = setup(sdkConfig);

    expect(fetchMock.calls(AUTH_PROVIDER_URL)).toHaveLength(1);

    rerender(
      <MetabaseProvider
        config={{
          ...sdkConfig,
        }}
      >
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(fetchMock.calls(AUTH_PROVIDER_URL)).toHaveLength(1);

    expect(screen.queryByText("Initializing...")).not.toBeInTheDocument();
    expect(
      // this is just something we know it's on the screen when everything is ok
      screen.getByTestId("query-visualization-root"),
    ).toBeInTheDocument();
  });

  describe("when using jwtProvider", () => {
    it("should retrieve the session from the jwtProvider and send it as 'X-Metabase-Session' header", async () => {
      const sdkConfig = defineEmbeddingSdkConfig({
        metabaseInstanceUrl: METABASE_INSTANCE_URL,
        jwtProviderUri: AUTH_PROVIDER_URL,
      });

      setup(sdkConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());
      expect(getLastAuthProviderApiCall()![1]).toMatchObject({
        credentials: "include",
        method: "GET",
      });

      await waitForRequest(() => getLastUserApiCall());
      expect(getLastUserApiCall()![1]).toMatchObject({
        headers: { "X-Metabase-Session": [MOCK_SESSION.id] },
      });

      await waitForRequest(() => getLastCardQueryApiCall());
      expect(getLastCardQueryApiCall()![1]).toMatchObject({
        headers: { "X-Metabase-Session": [MOCK_SESSION.id] },
      });
    });

    it("should use `fetchRequestToken` if provided", async () => {
      const customFetchFunction = jest.fn().mockImplementation(() => ({
        ...MOCK_SESSION,
        id: "mock-id-from-custom-fetch-function",
      }));

      const sdkConfig = defineEmbeddingSdkConfig({
        metabaseInstanceUrl: METABASE_INSTANCE_URL,
        jwtProviderUri: AUTH_PROVIDER_URL,
        fetchRequestToken: customFetchFunction,
      });

      setup(sdkConfig);

      expect(customFetchFunction).toHaveBeenCalledWith(AUTH_PROVIDER_URL);

      await waitForRequest(() => getLastUserApiCall());
      expect(getLastUserApiCall()![1]).toMatchObject({
        headers: {
          "X-Metabase-Session": ["mock-id-from-custom-fetch-function"],
        },
      });

      await waitForRequest(() => getLastCardQueryApiCall());
      expect(getLastCardQueryApiCall()![1]).toMatchObject({
        headers: {
          "X-Metabase-Session": ["mock-id-from-custom-fetch-function"],
        },
      });
    });
  });

  describe("when using apiKeyProvider", () => {
    it("should send the api key as 'X-Api-Key' header", async () => {
      const sdkConfig = defineEmbeddingSdkConfig({
        metabaseInstanceUrl: METABASE_INSTANCE_URL,
        apiKey: MOCK_API_KEY,
      });

      setup(sdkConfig);

      await waitForRequest(() => getLastUserApiCall());
      expect(getLastUserApiCall()![1]).toMatchObject({
        headers: { "X-Api-Key": [MOCK_API_KEY] },
      });

      await waitForRequest(() => getLastCardQueryApiCall());
      expect(getLastCardQueryApiCall()![1]).toMatchObject({
        headers: { "X-Api-Key": [MOCK_API_KEY] },
      });

      await waitForRequest(() => getLastCardQueryApiCall());
      expect(getLastCardQueryApiCall()![1]).toMatchObject({
        headers: { "X-Api-Key": [MOCK_API_KEY] },
      });
    });
  });
});
