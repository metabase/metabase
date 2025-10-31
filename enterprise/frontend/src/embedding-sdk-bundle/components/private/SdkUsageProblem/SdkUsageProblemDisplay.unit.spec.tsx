import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { screen, within } from "__support__/ui";
import * as IsLocalhostModule from "embedding-sdk-bundle/lib/get-is-localhost";
import { setUsageProblem } from "embedding-sdk-bundle/store/reducer";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import {
  createMockApiKeyConfig,
  createMockSdkConfig,
} from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockSdkState,
  createMockTokenState,
} from "embedding-sdk-bundle/test/mocks/state";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const TEST_USER = createMockUser();

jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

const mockSdkDispatchFn = jest.fn();
jest.mock("embedding-sdk-bundle/store", () => ({
  ...jest.requireActual("embedding-sdk-bundle/store"),
  useSdkDispatch: () => mockSdkDispatchFn,
}));

interface Options {
  authConfig: MetabaseAuthConfig;
  hasEmbeddingFeature?: boolean;
  isEmbeddingSdkEnabled?: boolean;
  isDevelopmentMode?: boolean;
  hasExpirationClaim?: boolean;
}

const setup = ({ hasExpirationClaim = true, ...options }: Options) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: options.hasEmbeddingFeature ?? true,
    development_mode: options.isDevelopmentMode ?? false,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-embedding-sdk": options.isEmbeddingSdkEnabled ?? true,
  });

  const MINUTE = 60;
  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: TEST_USER,
    sdk: createMockSdkState({
      token: createMockTokenState({
        token: {
          id: "123",
          exp: hasExpirationClaim
            ? Math.round(Date.now() / 1000) + 10 * MINUTE
            : null,
        },
      }),
    }),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValues);

  return renderWithSDKProviders(<div>hello!</div>, {
    componentProviderProps: { authConfig: options.authConfig },
    storeInitialState: state,
  });
};

const PROBLEM_CARD_TEST_ID = "sdk-usage-problem-card";
const PROBLEM_INDICATOR_TEST_ID = "sdk-usage-problem-indicator";

describe("SdkUsageProblemDisplay", () => {
  it("does not show an error when JWT is provided with a license", () => {
    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: true,
    });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();
  });

  it("shows an error when JWT is used without a license", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);
    expect(within(card).getByText("Error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /Attempting to use this in other ways is in breach of our usage policy/,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade",
    );
  });

  it("shows a warning when API keys are used in localhost", async () => {
    expect(window.location.origin).toBe("http://localhost");

    setup({ authConfig: createMockApiKeyConfig(), hasEmbeddingFeature: true });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/authentication#2-add-a-new-endpoint-to-your-backend-to-handle-authentication",
    );
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
    expect(within(card).getByText("Error")).toBeInTheDocument();

    expect(
      within(card).getByText(
        /This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO./,
      ),
    ).toBeInTheDocument();

    mock.mockRestore();
  });

  // Caveat: we cannot detect this on non-localhost environments, as
  // CORS is disabled on /api/session/properties.
  it("shows an error when Embedding SDK is disabled on localhost", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      hasEmbeddingFeature: true,
      isEmbeddingSdkEnabled: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText(
        /Embedding is not enabled for this instance. Please enable it in settings./,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/introduction#in-metabase",
    );
  });

  it("shows a warning when development mode is enabled", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        "This Metabase is in development mode intended exclusively for testing. Using this Metabase for everyday BI work or when embedding in production is considered unfair usage.",
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade",
    );
  });

  it('should show a warning when JWT token does not contain the "exp" claim', async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: false,
      hasExpirationClaim: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText("This embed is powered by the Metabase SDK."),
    ).toBeInTheDocument();

    expect(
      within(card).getByText(
        `The JWT token is missing the "exp" (expiration) claim. We will disallow tokens without "exp" in a future release. Please add "exp" to the token payload.`,
      ),
    ).toBeInTheDocument();

    const docsLink = within(card).getByRole("link", {
      name: "Documentation",
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/sdk/authentication#2-add-a-new-endpoint-to-your-backend-to-handle-authentication",
    );
  });

  it("hides the problem when 'hide' is clicked", async () => {
    setup({
      authConfig: createMockSdkConfig(),
      isEmbeddingSdkEnabled: true,
      isDevelopmentMode: true,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    await userEvent.click(within(card).getByText("Hide warning"));

    expect(mockSdkDispatchFn).toHaveBeenCalledWith(setUsageProblem(null));
  });
});
