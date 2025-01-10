import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as IsLocalhostModule from "embedding-sdk/lib/is-localhost";
import {
  createMockApiKeyConfig,
  createMockAuthProviderUriConfig,
} from "embedding-sdk/test/mocks/config";
import { createMockSdkState } from "embedding-sdk/test/mocks/state";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

interface Options {
  authConfig: MetabaseAuthConfig;
  hasEmbeddingFeature?: boolean;
}

const setup = (options: Options) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: options.hasEmbeddingFeature ?? true,
  });

  const settingValues = createMockSettings({ "token-features": tokenFeatures });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: TEST_USER,
    sdk: createMockSdkState(),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValues);

  return renderWithProviders(<div>hello!</div>, {
    sdkProviderProps: { authConfig: options.authConfig },
    storeInitialState: state,
    mode: "sdk",
  });
};

const PROBLEM_CARD_TEST_ID = "sdk-usage-problem-card";
const PROBLEM_INDICATOR_TEST_ID = "sdk-usage-problem-indicator";

describe("SdkUsageProblemDisplay", () => {
  it("does not show an error when JWT is provided with a license", () => {
    setup({
      authConfig: createMockAuthProviderUriConfig(),
      hasEmbeddingFeature: true,
    });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();
  });

  it("shows an error when JWT is used without a license", async () => {
    setup({
      authConfig: createMockAuthProviderUriConfig(),
      hasEmbeddingFeature: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
    expect(within(card).getByText("error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /Attempting to use this in other ways is in breach of our usage policy/,
      ),
    ).toBeInTheDocument();
  });

  it("shows a warning when API keys are used in localhost", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({ authConfig: createMockApiKeyConfig(), hasEmbeddingFeature: true });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
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
      authConfig: createMockApiKeyConfig(),
      hasEmbeddingFeature: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
    expect(within(card).getByText("error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    mock.mockRestore();
  });

  it("shows an error when neither an Auth Provider URI or API keys are provided", async () => {
    setup({
      // @ts-expect-error - we're intentionally passing neither to simulate bad usage
      authConfig: { metabaseInstanceUrl: "http://localhost" },
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    expect(
      within(screen.getByTestId(PROBLEM_CARD_TEST_ID)).getByText(
        /must provide either an Auth Provider URI or an API key for authentication/,
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when both an Auth Provider URI and API keys are provided", async () => {
    setup({
      // @ts-expect-error - we're intentionally passing both to simulate bad usage
      authConfig: {
        apiKey: "TEST_API_KEY",
        metabaseInstanceUrl: "http://localhost",
        authProviderUri: "http://TEST_URI/sso/metabase",
      },
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    expect(
      within(screen.getByTestId(PROBLEM_CARD_TEST_ID)).getByText(
        /cannot use both an Auth Provider URI and API key authentication at the same time/,
      ),
    ).toBeInTheDocument();
  });
});
