import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk/store";
import { createMockJwtConfig } from "embedding-sdk/test/mocks/config";
import { createMockSdkState } from "embedding-sdk/test/mocks/state";
import type { SDKConfigWithJWT } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

interface Options {
  config?: Partial<SDKConfigWithJWT>;
  tokenFeatureEnabled?: boolean;
}

const setup = (options: Partial<Options>) => {
  fetchMock.get("http://TEST_URI/sso/metabase", {
    id: "TEST_JWT_TOKEN",
    exp: 1965805007,
    iat: 1965805007,
  });

  setupCurrentUserEndpoint(TEST_USER);

  const settingValues = createMockSettings();

  const tokenFeatures = createMockTokenFeatures({
    // TODO: change to "embedding_sdk" once the token feature PR landed.
    embedding: options.tokenFeatureEnabled ?? true,
  });

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser: TEST_USER,
    sdk: createMockSdkState(),
  });

  setupEnterprisePlugins();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValuesWithToken);

  const config = createMockJwtConfig({
    jwtProviderUri: "http://TEST_URI/sso/metabase",
    ...options.config,
  });

  return renderWithProviders(<div>hello!</div>, {
    sdkProviderProps: { config },
    storeInitialState: state,
    customReducers: sdkReducers,
    mode: "sdk",
  });
};

describe("AppInitializeController", () => {
  it("should not show an error when JWT is provided", async () => {
    setup({});

    expect(
      screen.queryByTestId("sdk-license-problem-banner"),
    ).not.toBeInTheDocument();
  });

  it("should show an error when SSO is used when the token feature is disabled", async () => {
    setup({ tokenFeatureEnabled: false });

    expect(
      screen.getByTestId("sdk-license-problem-banner"),
    ).toBeInTheDocument();
  });

  it("should show an error when both JWT and API keys are provided", async () => {
    setup({
      config: {
        // @ts-expect-error - we're intentionally passing both!
        apiKey: "TEST_API_KEY",
        jwtProviderUri: "http://TEST_URI/sso/metabase",
      },
    });

    const banner = screen.getByTestId("sdk-license-problem-banner");
    expect(banner).toBeInTheDocument();
  });
});
