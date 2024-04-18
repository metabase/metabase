import { renderWithProviders, screen } from "__support__/ui";
import { AppInitializeController } from "./AppInitializeController";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import {
  setupApiKeyEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { mockSettings } from "__support__/settings";
import { setupEnterprisePlugins } from "__support__/enterprise";

const MOCK_CONFIG = createMockConfig();

const setup = ({ isLoggedIn = true, isInitialized = true } = {}) => {
  const currentUser = createMockUser();
  setupCurrentUserEndpoint(currentUser);

  const settingValues = createMockSettings();
  const tokenFeatures = createMockTokenFeatures();
  const settings = [
    createMockSettingDefinition({
      key: "token-features",
      value: tokenFeatures,
    }),
  ];

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
    embeddingSessionToken: {
      token: null,
      loading: false,
      error: null,
    },
  });

  setupEnterprisePlugins();
  setupApiKeyEndpoints([]);
  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValuesWithToken);

  return renderWithProviders(
    <AppInitializeController config={MOCK_CONFIG}>
      <div>Child Component</div>
    </AppInitializeController>,
    {
      storeInitialState: state,
      mode: "sdk",
    },
  );
};

describe("AppInitializeController", () => {
  it("renders loading message while initialization is in progress", () => {
    setup();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    screen.debug(undefined, 10000000);
  });

  it("renders children when initialization is complete", async () => {
    setup();
    expect(await screen.findByText("Child Component")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
