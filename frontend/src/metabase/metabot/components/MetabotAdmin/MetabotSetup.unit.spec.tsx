import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotSetup } from "./MetabotSetup";

jest.mock("./MetabotNavPane", () => ({
  MetabotNavPane: () => <div>Metabot navigation</div>,
}));

jest.mock("./MetabotProviderApiKey", () => ({
  MetabotProviderApiKey: ({
    provider,
    error,
  }: {
    provider: MetabotProvider;
    error?: string | null;
  }) => (
    <div>
      <div>{`Provider API key: ${provider}`}</div>
      {error ? <div>{`API key error: ${error}`}</div> : null}
    </div>
  ),
}));

const DEFAULT_RESPONSES: Record<MetabotProvider, MetabotSettingsResponse> = {
  anthropic: {
    value: "anthropic/claude-haiku-4-5",
    models: [
      {
        id: "claude-haiku-4-5",
        display_name: "Claude Haiku 4.5",
        group: "Haiku",
      },
      {
        id: "claude-sonnet-4-5",
        display_name: "Claude Sonnet 4.5",
        group: "Sonnet",
      },
    ],
  },
  openai: {
    value: "openai/gpt-4.1-mini",
    models: [
      { id: "gpt-4.1-mini", display_name: "GPT-4.1 mini" },
      { id: "gpt-4.1", display_name: "GPT-4.1" },
    ],
  },
  openrouter: {
    value: "openrouter/openai/gpt-4.1-mini",
    models: [
      {
        id: "openai/gpt-4.1-mini",
        display_name: "OpenAI GPT-4.1 mini",
        group: "OpenAI",
      },
    ],
  },
};

type SetupOptions = {
  isHosted?: boolean;
  savedProviderValue?: string | null;
  isConfigured?: boolean;
  providerSettingIsEnv?: boolean;
  providerSettingEnvName?: string;
  apiKeyValues?: Partial<Record<MetabotProvider, string | null>>;
  responses?: Partial<
    Record<
      MetabotProvider,
      MetabotSettingsResponse | (() => Promise<MetabotSettingsResponse>)
    >
  >;
  updateResponse?: MetabotSettingsResponse;
};

async function setup({
  isHosted = false,
  savedProviderValue = "anthropic/claude-haiku-4-5",
  isConfigured = true,
  providerSettingIsEnv = false,
  providerSettingEnvName = "LLM_METABOT_PROVIDER",
  apiKeyValues,
  responses,
  updateResponse = {
    value: "anthropic/claude-sonnet-4-5",
    models: DEFAULT_RESPONSES.anthropic.models,
  },
}: SetupOptions = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const mergedApiKeyValues: Record<MetabotProvider, string | null> = {
    anthropic: "**********45",
    openai: null,
    openrouter: null,
    ...apiKeyValues,
  };

  setupPropertiesEndpoints(
    createMockSettings({
      "is-hosted?": isHosted,
      "llm-metabot-provider": savedProviderValue,
      "llm-metabot-configured?": isConfigured,
    }),
  );

  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: savedProviderValue,
      is_env_setting: providerSettingIsEnv,
      env_name: providerSettingIsEnv ? providerSettingEnvName : undefined,
    }),
    createMockSettingDefinition({
      key: "llm-anthropic-api-key",
      value: mergedApiKeyValues.anthropic ?? undefined,
    }),
    createMockSettingDefinition({
      key: "llm-openai-api-key",
      value: mergedApiKeyValues.openai ?? undefined,
    }),
    createMockSettingDefinition({
      key: "llm-openrouter-api-key",
      value: mergedApiKeyValues.openrouter ?? undefined,
    }),
  ]);

  const responseMap = { ...DEFAULT_RESPONSES, ...responses };

  for (const provider of Object.keys(responseMap) as MetabotProvider[]) {
    const response = responseMap[provider];

    fetchMock.get(
      `path:/api/metabot/settings?provider=${provider}`,
      typeof response === "function" ? response : response,
    );
  }

  fetchMock.put("path:/api/metabot/settings", updateResponse);

  const { history } = renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotSetup} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "is-hosted?": isHosted,
        }),
      },
    },
  );

  if (!isHosted) {
    await screen.findByLabelText("Provider");
  }

  return { history };
}

async function selectProvider(providerLabel: string) {
  await userEvent.click(screen.getByLabelText("Provider"));
  await userEvent.click(
    await screen.findByRole("option", { name: providerLabel }),
  );
}

async function openModelSelector() {
  await userEvent.click(screen.getByLabelText("Model"));
  await userEvent.keyboard("{ArrowDown}");
}

describe("MetabotSetup", () => {
  it("should redirect to the hosted Metabot page when hosted", async () => {
    const { history } = await setup({ isHosted: true });

    await waitFor(() => {
      expect(history?.getCurrentLocation()?.pathname).toBe("/admin/metabot/");
    });
  });

  it("should not redirect to the hosted Metabot page when not hosted", async () => {
    const { history } = await setup({ isHosted: false });

    await screen.findByText("Connect to AI Provider");

    expect(history?.getCurrentLocation()?.pathname).toBe(
      "/admin/metabot/setup",
    );
  });

  it("shows the env var message and disables both provider and model inputs when provider is env-backed", async () => {
    await setup({
      providerSettingIsEnv: true,
      apiKeyValues: { anthropic: "**********45" },
    });

    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent(
      "This has been set by the LLM_METABOT_PROVIDER environment variable.",
    );
    expect(screen.getByLabelText("Provider")).toBeDisabled();
    expect(await screen.findByLabelText("Model")).toBeDisabled();
  });

  it("shows Anthropic as the recommended provider in the dropdown", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Provider"));

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(await screen.findByText("- Recommended")).toBeInTheDocument();
  });

  it("shows the connected badge with the saved provider and model", async () => {
    await setup();
    await screen.findByText(/Provider API key: anthropic/);
    await screen.findByLabelText("Model");

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });

  it("shows the not connected badge when not configured", async () => {
    await setup({ savedProviderValue: null, isConfigured: false });

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("shows the model loader when switching providers", async () => {
    const openAIRequest = { resolve: null as null | (() => void) };

    await setup({
      apiKeyValues: { anthropic: "**********45", openai: "**********54" },
      responses: {
        openai: async () => {
          await new Promise<void>((resolve) => {
            openAIRequest.resolve = resolve;
          });

          return DEFAULT_RESPONSES.openai;
        },
      },
    });

    await selectProvider("OpenAI");

    await waitFor(() => {
      expect(screen.getByLabelText("Model")).toHaveAttribute(
        "placeholder",
        "Loading models...",
      );
    });

    if (openAIRequest.resolve) {
      openAIRequest.resolve();
    }
  });

  it("shows the new model list and resets the selected model when switching providers", async () => {
    await setup({
      apiKeyValues: { anthropic: "**********45", openai: "**********54" },
    });
    await screen.findByLabelText("Model");

    await selectProvider("OpenAI");

    await waitFor(() => {
      expect(screen.getByLabelText("Model")).toHaveValue("");
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Model")).toHaveAttribute(
        "placeholder",
        "Select a model",
      );
    });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/metabot/settings?provider=openai",
        ),
      ).toBe(true);
    });

    expect(screen.getByLabelText("Model")).toHaveAttribute(
      "placeholder",
      "Select a model",
    );
  });

  it("shows model groups from the backend in the model picker", async () => {
    await setup();
    await screen.findByLabelText("Model");

    await openModelSelector();

    expect(await screen.findByText("Sonnet")).toBeInTheDocument();
  });

  it("does not show the API key input when no provider is selected", async () => {
    await setup({ savedProviderValue: null, isConfigured: false });

    expect(screen.queryByText(/Provider API key:/)).not.toBeInTheDocument();
  });

  it("does not show the model selector when there is no API key", async () => {
    await setup({
      apiKeyValues: { anthropic: null },
    });

    await screen.findByText(/Provider API key: anthropic/);
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("does not show the model selector when the configured API key is incorrect", async () => {
    await setup({
      apiKeyValues: { anthropic: "**********45" },
      responses: {
        anthropic: {
          value: "anthropic/claude-haiku-4-5",
          "api-key-error": "Anthropic API key expired or invalid",
          models: [],
        },
      },
    });

    expect(
      await screen.findByText(
        "API key error: Anthropic API key expired or invalid",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("saves when picking a model from the model picker", async () => {
    await setup();
    await screen.findByLabelText("Model");

    await openModelSelector();
    await userEvent.click(await screen.findByText("Claude Sonnet 4.5"));

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
        true,
      );
    });

    const request = fetchMock.callHistory
      .calls("path:/api/metabot/settings")
      .find((call) => call.request?.method === "PUT");

    expect(request?.options?.body).toBe(
      JSON.stringify({ provider: "anthropic", model: "claude-sonnet-4-5" }),
    );
  });
});
