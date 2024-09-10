import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as IsLocalhostModule from "embedding-sdk/lib/is-localhost";
import {
  createMockApiKeyConfig,
  createMockJwtConfig,
} from "embedding-sdk/test/mocks/config";
import { createMockSdkState } from "embedding-sdk/test/mocks/state";
import type { SDKConfig } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

interface Options {
  config: SDKConfig;
  tokenFeatureEnabled?: boolean;
}

const setup = (options: Options) => {
  const tokenFeatures = createMockTokenFeatures({
    // TODO: change to "embedding_sdk" once the token feature PR landed.
    embedding: options.tokenFeatureEnabled ?? true,
  });

  const settingValues = createMockSettings({ "token-features": tokenFeatures });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: TEST_USER,
    sdk: createMockSdkState(),
  });

  setupEnterprisePlugins();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValues);

  return renderWithProviders(<div>hello!</div>, {
    sdkProviderProps: { config: options.config },
    storeInitialState: state,
    mode: "sdk",
  });
};

describe("AppInitializeController", () => {
  it("should not show an error when JWT is provided with a license", () => {
    setup({ config: createMockJwtConfig(), tokenFeatureEnabled: true });

    expect(
      screen.queryByTestId("sdk-license-problem-indicator"),
    ).not.toBeInTheDocument();
  });

  it("shows a warning when API keys are used in localhost", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({ config: createMockApiKeyConfig(), tokenFeatureEnabled: true });

    await userEvent.click(screen.getByTestId("sdk-license-problem-indicator"));

    const card = screen.getByTestId("sdk-license-problem-card");
    expect(within(card).getByText("warning")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when API keys are used in production", async () => {
    const mock = jest
      .spyOn(IsLocalhostModule, "getIsLocalhost")
      .mockImplementation(() => false);

    setup({
      config: createMockApiKeyConfig(),
      tokenFeatureEnabled: true,
    });

    await userEvent.click(screen.getByTestId("sdk-license-problem-indicator"));

    const card = screen.getByTestId("sdk-license-problem-card");
    expect(within(card).getByText("error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    mock.mockRestore();
  });

  it("shows an error when JWT is used without a license", async () => {
    setup({ config: createMockJwtConfig(), tokenFeatureEnabled: false });

    await userEvent.click(screen.getByTestId("sdk-license-problem-indicator"));

    const card = screen.getByTestId("sdk-license-problem-card");
    expect(within(card).getByText("error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /Attempting to use this in other ways is in breach of our usage policy/,
      ),
    ).toBeInTheDocument();
  });

  it("should show an error when both JWT and API keys are provided", async () => {
    setup({
      // @ts-expect-error - we're intentionally passing both to simulate bad usage
      config: {
        apiKey: "TEST_API_KEY",
        metabaseInstanceUrl: "http://localhost",
        jwtProviderUri: "http://TEST_URI/sso/metabase",
      },
    });

    await userEvent.click(screen.getByTestId("sdk-license-problem-indicator"));

    expect(
      within(screen.getByTestId("sdk-license-problem-card")).getByText(
        /cannot use both JWT and API key authentication at the same time/,
      ),
    ).toBeInTheDocument();
  });
});
