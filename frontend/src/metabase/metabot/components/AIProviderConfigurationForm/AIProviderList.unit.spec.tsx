import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupLlmActiveModelEndpoint,
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupReorderLlmProvidersEndpoint,
} from "__support__/server-mocks/metabot";
import { findRequests } from "__support__/server-mocks/util";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  LlmActiveModel,
  LlmConnectionModels,
  LlmProviderConnection,
} from "metabase-types/api";
import {
  createMockLlmActiveModel,
  createMockLlmConnectionModels,
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIProviderList } from "./AIProviderList";

type SetupOpts = {
  usable?: boolean;
  models?: LlmConnectionModels[];
  connections?: LlmProviderConnection[];
  activeModel?: LlmActiveModel;
  isFallbackEnabled?: boolean;
  hasAiControls?: boolean;
};

const setup = ({
  usable = true,
  models = [],
  connections,
  activeModel = createMockLlmActiveModel(),
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
  setupLlmProvidersEndpoint(
    connections ?? [
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
    ],
  );
  setupLlmModelsEndpoint(models);
  setupLlmActiveModelEndpoint(activeModel);
  setupReorderLlmProvidersEndpoint([]);

  renderWithProviders(<AIProviderList />, {
    storeInitialState: {
      settings: mockSettings(sessionProperties),
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("AIProviderList", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

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

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/llm/models")).toHaveLength(
        1,
      ),
    );
  });

  it.each([
    ["anthropic", "SQL generation also runs on this connection"],
    ["openai", "Semantic search also runs on this connection"],
  ])(
    "warns that removing the %s connection also turns off the feature reading it",
    async (key, warning) => {
      setup();

      const row = await screen.findByTestId(`provider-${key}`);
      await userEvent.click(within(row).getByLabelText("Provider options"));
      await userEvent.click(await screen.findByText("Remove"));

      const modal = await screen.findByRole("dialog", {
        name: "Remove this provider?",
      });
      expect(within(modal).getByText(new RegExp(warning))).toBeInTheDocument();
      expect(
        within(modal).getByText(/saved credentials will be deleted/),
      ).toBeInTheDocument();
    },
  );

  it("shows the stored failure the backend reports for a provider", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          type: "anthropic",
          name: "Anthropic",
          error: { message: "invalid x-api-key", fatal: true },
        }),
        createMockLlmProviderConnection({
          key: "openai",
          type: "openai",
          name: "OpenAI",
        }),
      ],
    });

    expect(
      await within(await screen.findByTestId("provider-anthropic")).findByText(
        "invalid x-api-key",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("provider-openai")).queryByText(
        "invalid x-api-key",
      ),
    ).not.toBeInTheDocument();
  });

  it("offers a drag handle for every connection whose position can be saved", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          name: "Anthropic",
        }),
        createMockLlmProviderConnection({
          key: "openai",
          type: "openai",
          name: "OpenAI",
        }),
        createMockLlmProviderConnection({
          key: "mistral",
          type: "mistral",
          name: "Mistral",
          source: "env",
          reorderable: false,
        }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(screen.getByLabelText("Reorder Anthropic")).toBeInTheDocument();
    expect(screen.getByLabelText("Reorder OpenAI")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reorder Mistral")).not.toBeInTheDocument();
  });

  it("does not offer reordering for a single connection", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          name: "Anthropic",
        }),
      ],
    });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-drag-handle"),
    ).not.toBeInTheDocument();
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

  it("names the provider and model in use while the fallback is carrying requests", async () => {
    setup({
      activeModel: createMockLlmActiveModel({
        connection_name: "OpenAI",
        model: "gpt-5.4",
        model_name: "GPT-5.4",
        is_fallback: true,
      }),
    });

    const notice = await screen.findByTestId("active-provider-notice");
    expect(notice).toHaveTextContent(
      "Metabot is currently running on OpenAI using GPT-5.4.",
    );
  });

  it("says nothing about the model in use while the selected provider is serving requests", async () => {
    setup({ activeModel: createMockLlmActiveModel({ is_fallback: false }) });

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("active-provider-notice"),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton until the connections have loaded", async () => {
    setup();

    expect(screen.getByTestId("provider-list-skeleton")).toBeInTheDocument();

    expect(await screen.findByTestId("provider-anthropic")).toBeInTheDocument();
    expect(
      screen.queryByTestId("provider-list-skeleton"),
    ).not.toBeInTheDocument();
  });
});
