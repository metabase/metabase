import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBillingEndpoints,
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
  TokenStatusFeature,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";

import { MetabotSetup } from "./MetabotSetup";
import type { MetabotApiKeyProvider } from "./utils";

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
  metabase: {
    value: "metabase/anthropic/claude-sonnet-4-6",
    models: [
      {
        id: "anthropic/claude-haiku-4-5",
        display_name: "Claude Haiku 4.5",
      },
      {
        id: "anthropic/claude-sonnet-4-6",
        display_name: "Claude Sonnet 4.6",
      },
      {
        id: "anthropic/claude-opus-4-1",
        display_name: "Claude Opus 4.1",
      },
    ],
  },
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

type MetabotUsageQuota = {
  tokens: number | null;
  updated_at: string | null;
};

type SetupOptions = {
  isHosted?: boolean;
  llmProxyConfigured?: boolean;
  savedProviderValue?: string | null;
  isConfigured?: boolean;
  providerSettingIsEnv?: boolean;
  providerSettingEnvName?: string;
  isStoreUser?: boolean;
  anyStoreUserEmailAddress?: string;
  metabasePricePerUnit?: number;
  metabaseBillingPeriodMonths?: number;
  metabotUsageQuotas?: MetabotUsageQuota[] | null;
  tokenStatusFeatures?: TokenStatusFeature[];
  refreshedTokenStatusFeatures?: TokenStatusFeature[];
  purchaseCloudAddOnResponse?: number | { status: number; body: unknown };
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
  llmProxyConfigured = isHosted,
  savedProviderValue = "anthropic/claude-haiku-4-5",
  isConfigured = true,
  providerSettingIsEnv = false,
  providerSettingEnvName = "LLM_METABOT_PROVIDER",
  isStoreUser = isHosted,
  anyStoreUserEmailAddress = "store-admin@metabase.test",
  metabasePricePerUnit = 3.75,
  metabaseBillingPeriodMonths = 1,
  metabotUsageQuotas = null,
  tokenStatusFeatures = [],
  refreshedTokenStatusFeatures = tokenStatusFeatures,
  purchaseCloudAddOnResponse = 200,
  apiKeyValues,
  responses,
  updateResponse = {
    value: "anthropic/claude-sonnet-4-5",
    models: DEFAULT_RESPONSES.anthropic.models,
  },
}: SetupOptions = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const mergedApiKeyValues: Record<MetabotApiKeyProvider, string | null> = {
    anthropic: "**********45",
    openai: null,
    openrouter: null,
    ...apiKeyValues,
  };

  const sessionProperties = createMockSettings({
    "is-hosted?": isHosted,
    "llm-proxy-configured?": llmProxyConfigured,
    "llm-metabot-provider": savedProviderValue,
    "llm-metabot-configured?": isConfigured,
    "token-features": createMockTokenFeatures({
      hosting: isHosted,
      "offer-metabase-ai-managed": isHosted,
      "metabase-ai-managed": tokenStatusFeatures.includes(
        "metabase-ai-managed",
      ),
    }),
    "token-status": createMockTokenStatus({
      features: tokenStatusFeatures,
      "store-users": isStoreUser
        ? [{ email: "user@metabase.test" }]
        : anyStoreUserEmailAddress
          ? [{ email: anyStoreUserEmailAddress }]
          : [],
    }),
  });

  setupPropertiesEndpoints(sessionProperties);

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

  if (isHosted) {
    setupBillingEndpoints({
      billingPeriodMonths: metabaseBillingPeriodMonths,
      hasBasicTransformsAddOn: false,
      hasAdvancedTransformsAddOn: false,
      skipCloudAddOns: true,
    });
    setupMetabaseManagedAiEndpoints({
      billingPeriodMonths: metabaseBillingPeriodMonths,
      metabasePricePerUnit,
      metabotUsageQuota: metabotUsageQuotas?.[0] ?? null,
      purchaseCloudAddOnResponse,
    });

    fetchMock.post("path:/api/premium-features/token/refresh", () => {
      sessionProperties["token-features"] = createMockTokenFeatures({
        hosting: isHosted,
        "offer-metabase-ai-managed": isHosted,
        "metabase-ai-managed": refreshedTokenStatusFeatures.includes(
          "metabase-ai-managed",
        ),
      });
      sessionProperties["token-status"] = createMockTokenStatus({
        features: refreshedTokenStatusFeatures,
      });

      return sessionProperties["token-status"];
    });
  }

  const settings = mockSettings(sessionProperties);
  setupEnterpriseOnlyPlugin("metabot");

  for (const provider of Object.keys(responseMap) as MetabotProvider[]) {
    const response = responseMap[provider];

    fetchMock.get({
      url: "path:/api/metabot/settings",
      query: { provider },
      response,
    });
  }

  fetchMock.put("path:/api/metabot/settings", () => {
    sessionProperties["llm-metabot-provider"] = updateResponse.value;
    sessionProperties["llm-metabot-configured?"] = true;

    return updateResponse;
  });

  const { history } = renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotSetup} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings,
      },
    },
  );

  if (!isHosted) {
    await screen.findByLabelText("Provider");
  }

  return { history };
}

async function openModelSelector() {
  await userEvent.click(screen.getByLabelText("Model"));
  await userEvent.keyboard("{ArrowDown}");
}

async function selectProvider(name: string) {
  await userEvent.click(screen.getByLabelText("Provider"));
  await userEvent.click(await screen.findByRole("option", { name }));
}

describe("MetabotSetup", () => {
  afterEach(() => {
    reinitialize();
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

  it("shows Anthropic as selectable in the provider dropdown", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Provider"));

    const anthropicOption = await screen.findByRole("option", {
      name: "Anthropic",
    });
    expect(anthropicOption).toBeInTheDocument();
    expect(anthropicOption).not.toHaveAttribute("aria-disabled", "true");
  });

  it("shows Coming soon for non-Anthropic providers and disables them", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Provider"));

    const openaiOption = await screen.findByRole("option", {
      name: /OpenAI/,
    });
    expect(openaiOption).toHaveAttribute("data-combobox-disabled");

    const openrouterOption = await screen.findByRole("option", {
      name: /OpenRouter/,
    });
    expect(openrouterOption).toHaveAttribute("data-combobox-disabled");

    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
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

  // TODO: Add these tests back once we allow configuring the model provider from the UI.
  // eslint-disable-next-line jest/no-commented-out-tests
  // it("shows the model loader when switching providers", async () => {
  //   const openAIRequest = { resolve: null as null | (() => void) };
  //
  //   await setup({
  //     apiKeyValues: { anthropic: "**********45", openai: "**********54" },
  //     responses: {
  //       openai: async () => {
  //         await new Promise<void>((resolve) => {
  //           openAIRequest.resolve = resolve;
  //         });
  //
  //         return DEFAULT_RESPONSES.openai;
  //       },
  //     },
  //   });
  //
  //   await selectProvider("OpenAI");
  //
  //   await waitFor(() => {
  //     expect(screen.getByLabelText("Model")).toHaveAttribute(
  //       "placeholder",
  //       "Loading models...",
  //     );
  //   });
  //
  //   if (openAIRequest.resolve) {
  //     openAIRequest.resolve();
  //   }
  // });
  //
  // eslint-disable-next-line jest/no-commented-out-tests
  // it("shows the new model list and resets the selected model when switching providers", async () => {
  //   await setup({
  //     apiKeyValues: { anthropic: "**********45", openai: "**********54" },
  //   });
  //   await screen.findByLabelText("Model");
  //
  //   await selectProvider("OpenAI");
  //
  //   await waitFor(() => {
  //     expect(screen.getByLabelText("Model")).toHaveValue("");
  //   });
  //
  //   await waitFor(() => {
  //     expect(screen.getByLabelText("Model")).toHaveAttribute(
  //       "placeholder",
  //       "Select a model",
  //     );
  //   });
  //
  //   await waitFor(() => {
  //     expect(
  //       fetchMock.callHistory.called(
  //         "path:/api/metabot/settings?provider=openai",
  //       ),
  //     ).toBe(true);
  //   });
  //
  //   expect(screen.getByLabelText("Model")).toHaveAttribute(
  //     "placeholder",
  //     "Select a model",
  //   );
  // });

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

  it("shows the connected Metabase-managed state without an API key or model picker", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    expect(
      await screen.findByText("Current billing cycle"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Provider API key:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("shows pricing details in a tooltip for the Metabase provider", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      isConfigured: false,
    });

    await screen.findByText("About Metabase AI service");
    await screen.findByTestId("metabase-ai-pricing-details");

    await userEvent.hover(screen.getByTestId("metabase-ai-pricing-details"));

    expect(
      await screen.findByText(
        "Tokens are chunks of text used by AI models. Usage includes both prompts and responses.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "https://www.metabase.com/license/hosting");
  });

  it("shows a contact-admin notice for non-store users on the Metabase provider", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      isConfigured: false,
      isStoreUser: false,
      anyStoreUserEmailAddress: "store-admin@metabase.test",
    });

    expect(
      await screen.findByText(
        "Please ask a Metabase Store Admin (store-admin@metabase.test) of your organization to enable this for you.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept terms & connect" }),
    ).not.toBeInTheDocument();
  });

  it("shows a direct connect button when the Metabase provider feature is already enabled", async () => {
    const user = userEvent.setup();

    await setup({
      isHosted: true,
      savedProviderValue: "anthropic/claude-haiku-4-5",
      isConfigured: true,
      isStoreUser: false,
      tokenStatusFeatures: ["metabase-ai-managed"],
      updateResponse: {
        value: "metabase/anthropic/claude-sonnet-4-6",
        models: DEFAULT_RESPONSES.metabase.models,
      },
    });

    await selectProvider("Metabase");

    const connectButton = await screen.findByRole("button", {
      name: "Connect",
    });

    expect(
      screen.queryByRole("checkbox", {
        name: /I agree with the Metabase AI add-on/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(connectButton);

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
        true,
      );
    });

    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
      ),
    ).toBe(false);

    const settingsRequest = fetchMock.callHistory
      .calls("path:/api/metabot/settings")
      .find((call) => call.request?.method === "PUT");

    expect(settingsRequest?.options?.body).toBe(
      JSON.stringify({ provider: "metabase", model: "" }),
    );
  });

  it("polls until the Metabase provider feature is enabled, then saves the default Metabase model", async () => {
    try {
      jest.useFakeTimers({ advanceTimers: true });
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      await setup({
        isHosted: true,
        savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
        isConfigured: false,
        isStoreUser: true,
        tokenStatusFeatures: [],
        refreshedTokenStatusFeatures: ["metabase-ai-managed"],
        updateResponse: {
          value: "metabase/anthropic/claude-sonnet-4-6",
          models: DEFAULT_RESPONSES.metabase.models,
        },
      });

      const termsCheckbox = await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI add-on/i,
      });
      const connectButton = await screen.findByRole("button", {
        name: "Connect",
      });

      expect(connectButton).toBeDisabled();
      expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();

      await user.click(termsCheckbox);

      expect(connectButton).toBeEnabled();

      await user.click(connectButton);

      expect(connectButton).toBeDisabled();
      expect(
        await screen.findByText("Setting up Metabot AI, please wait"),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/ee/cloud-add-ons/metabase-ai-managed",
          ),
        ).toBe(true);
      });

      const request = fetchMock.callHistory
        .calls("path:/api/ee/cloud-add-ons/metabase-ai-managed")
        .find((call) => call.request?.method === "POST");

      expect(request?.options?.body).toBe(
        JSON.stringify({ terms_of_service: true }),
      );

      await Promise.resolve();

      act(() => {
        jest.advanceTimersByTime(11 * 1000);
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/premium-features/token/refresh",
          ),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory
            .calls("path:/api/metabot/settings")
            .some(
              (call) =>
                call.request?.method === "PUT" ||
                call.options?.method === "PUT",
            ),
        ).toBe(true);
      });

      expect(
        await screen.findByText("Metabot AI is ready"),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Connect" }),
      ).not.toBeInTheDocument();

      const settingsRequest = fetchMock.callHistory
        .calls("path:/api/metabot/settings")
        .find(
          (call) =>
            call.request?.method === "PUT" || call.options?.method === "PUT",
        );

      expect(settingsRequest?.options?.body).toBe(
        JSON.stringify({ provider: "metabase", model: "" }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows live pricing for the Metabase provider", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      metabasePricePerUnit: 4.25,
    });

    expect(await screen.findByText("Price per token")).toBeInTheDocument();
    expect(screen.getByText("$4.25 per 1M tokens")).toBeInTheDocument();
  });

  it("shows usage summary for the connected Metabase provider", async () => {
    const updatedAt = "2026-04-02T19:29:12Z";
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      metabasePricePerUnit: 4.25,
      metabotUsageQuotas: [
        {
          tokens: 250000,
          updated_at: updatedAt,
        },
      ],
    });

    expect(
      await screen.findByText("Current billing cycle"),
    ).toBeInTheDocument();
    expect(await screen.findByText("250,000")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getByText("Total cost")).toBeInTheDocument();
    expect(screen.getByText("$1.06")).toBeInTheDocument();
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
