import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { screen, within } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockSdkState,
  createMockTokenState,
} from "embedding-sdk-bundle/test/mocks/state";
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

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual("metabase/embedding-sdk/config"),
  EMBEDDING_SDK_CONFIG: {
    isEmbeddingSdk: true,
    metabaseClientRequestHeader: "embedding-simple",
    enableEmbeddingSettingKey: "enable-embedding-simple",
    tokenFeatureKey: "embedding_simple",
  },
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG: {
    isSimpleEmbedding: true,
    useExistingUserSession: false,
  },
}));

interface Options {
  hasSimpleEmbeddingFeature?: boolean;
  isSimpleEmbeddingEnabled?: boolean;
}

const setup = (options: Options) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_simple: options.hasSimpleEmbeddingFeature ?? true,
  });

  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "enable-embedding-simple": options.isSimpleEmbeddingEnabled ?? true,
  });

  const MINUTE = 60;
  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: TEST_USER,
    sdk: createMockSdkState({
      token: createMockTokenState({
        token: {
          id: "123",
          exp: Math.round(Date.now() / 1000) + 10 * MINUTE,
        },
      }),
    }),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settingValues);

  return renderWithSDKProviders(<div>hello!</div>, {
    componentProviderProps: { authConfig: createMockSdkConfig() },
    storeInitialState: state,
  });
};

const PROBLEM_CARD_TEST_ID = "sdk-usage-problem-card";
const PROBLEM_INDICATOR_TEST_ID = "sdk-usage-problem-indicator";

describe("SdkUsageProblemDisplay (simple embedding)", () => {
  it("does not show an error when a license exists and is enabled", async () => {
    await setup({
      hasSimpleEmbeddingFeature: true,
      isSimpleEmbeddingEnabled: true,
    });

    expect(
      screen.queryByTestId(PROBLEM_INDICATOR_TEST_ID),
    ).not.toBeInTheDocument();

    expect(screen.queryByTestId(PROBLEM_CARD_TEST_ID)).not.toBeInTheDocument();
  });

  it("shows an error when used without a license", async () => {
    await setup({
      hasSimpleEmbeddingFeature: false,
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
      name: /Documentation/,
    });

    expect(docsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade",
    );
  });

  it("shows an error when simple embedding is disabled", async () => {
    await setup({
      hasSimpleEmbeddingFeature: true,
      isSimpleEmbeddingEnabled: false,
    });

    await userEvent.click(screen.getByTestId(PROBLEM_INDICATOR_TEST_ID));

    const card = screen.getByTestId(PROBLEM_CARD_TEST_ID);

    expect(
      within(card).getByText(/not enabled for this instance/),
    ).toBeInTheDocument();
  });
});
