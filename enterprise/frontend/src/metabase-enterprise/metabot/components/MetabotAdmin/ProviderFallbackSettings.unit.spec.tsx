import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupReorderLlmProvidersEndpoint,
} from "__support__/server-mocks/metabot";
import { findRequests } from "__support__/server-mocks/util";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { AIProviderList } from "metabase/metabot";
import { reinitialize } from "metabase/plugins";
import {
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

type SetupOpts = {
  isFallbackEnabled?: boolean;
  hasAiControls?: boolean;
};

const setup = ({
  isFallbackEnabled = true,
  hasAiControls = true,
}: SetupOpts = {}) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings({
    "llm-provider-fallback-enabled?": hasAiControls && isFallbackEnabled,
    "token-features": createMockTokenFeatures({ ai_controls: hasAiControls }),
  });
  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-provider-fallback-enabled?",
      value: isFallbackEnabled,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupLlmProviderTypesEndpoint([createMockLlmProviderType()]);
  setupLlmProvidersEndpoint([
    createMockLlmProviderConnection({
      key: "anthropic",
      type: "anthropic",
      name: "Anthropic",
    }),
    createMockLlmProviderConnection({
      key: "openai",
      type: "openai",
      name: "OpenAI",
    }),
  ]);
  setupLlmModelsEndpoint([]);
  setupReorderLlmProvidersEndpoint([]);

  const storeInitialState = {
    settings: mockSettings(sessionProperties),
    currentUser: createMockUser({ is_superuser: true }),
  };

  setupEnterpriseOnlyPlugin("metabot");

  renderWithProviders(<AIProviderList />, { storeInitialState });
};

describe("ProviderFallbackSettings", () => {
  afterEach(() => {
    reinitialize();
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("turns the fallback off through the setting", async () => {
    setup();

    const toggle = await screen.findByLabelText(
      "Fall back to the next provider",
    );
    // The switch stays disabled until the setting definitions land, and clicking it before then does nothing.
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toEqual([
        expect.objectContaining({
          url: expect.stringContaining(
            "/setting/llm-provider-fallback-enabled%3F",
          ),
          body: { value: false },
        }),
      ]);
    });
  });

  it("offers no fallback section without the AI Controls feature", async () => {
    setup({ hasAiControls: false });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-fallback-settings"),
    ).not.toBeInTheDocument();
  });
});
