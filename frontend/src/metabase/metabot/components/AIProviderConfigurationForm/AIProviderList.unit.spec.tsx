import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import {
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { LlmConnectionModels } from "metabase-types/api";
import {
  createMockLlmConnectionModels,
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIProviderList } from "./AIProviderList";

const setup = ({
  usable = true,
  models = [],
}: { usable?: boolean; models?: LlmConnectionModels[] } = {}) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings();
  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([]);
  setupLlmProviderTypesEndpoint([createMockLlmProviderType()]);
  setupLlmProvidersEndpoint([
    createMockLlmProviderConnection({
      key: "anthropic",
      type: "anthropic",
      name: "Anthropic",
      usable,
    }),
    createMockLlmProviderConnection({
      key: "openai",
      type: "openai",
      name: "OpenAI",
    }),
  ]);
  setupLlmModelsEndpoint(models);

  renderWithProviders(<AIProviderList />, {
    storeInitialState: {
      settings: mockSettings(sessionProperties),
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("AIProviderList", () => {
  it("does not badge a connection that has everything it needs", async () => {
    setup({ usable: true });

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Incomplete configuration"),
    ).not.toBeInTheDocument();
  });

  it("warns about a connection that is missing required settings", async () => {
    setup({ usable: false });

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Incomplete configuration"),
    ).toBeInTheDocument();
  });

  it("shows a model-loading failure on the provider it belongs to", async () => {
    setup({
      models: [
        createMockLlmConnectionModels({
          key: "anthropic",
          name: "Anthropic",
          type: "anthropic",
          models: [],
          error: "Anthropic API key expired or invalid",
        }),
        createMockLlmConnectionModels({
          key: "openai",
          name: "OpenAI",
          type: "openai",
        }),
      ],
    });

    expect(
      await within(await screen.findByTestId("provider-anthropic")).findByText(
        "Anthropic API key expired or invalid",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("provider-openai")).queryByText(
        "Anthropic API key expired or invalid",
      ),
    ).not.toBeInTheDocument();
  });

  it("fetches the models for every provider in a single shared request", async () => {
    setup({
      models: [
        createMockLlmConnectionModels({ key: "anthropic", name: "Anthropic" }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(await screen.findByText("Model")).toBeInTheDocument();

    expect(fetchMock.callHistory.calls("path:/api/llm/models")).toHaveLength(1);
  });
});
