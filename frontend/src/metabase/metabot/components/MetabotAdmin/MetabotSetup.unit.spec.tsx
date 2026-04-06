import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBillingEndpoints,
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
  SettingDefinition,
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

type MetabotSettingsApiResponse =
  | MetabotSettingsResponse
  | (() => Promise<MetabotSettingsResponse>);

type MetabotSettingKey =
  | "llm-metabot-provider"
  | "llm-anthropic-api-key"
  | "llm-openai-api-key"
  | "llm-openrouter-api-key";

type MetabotSettingDefinition = SettingDefinition<MetabotSettingKey>;
type MetabotSettingsUpdateBody = {
  provider: MetabotProvider;
  model?: string;
  "api-key"?: string | null;
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
  pauseUpdateResponse?: boolean;
  settingUpdateResponse?: number | { status: number; body?: unknown };
  responses?: Partial<Record<MetabotProvider, MetabotSettingsApiResponse>>;
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
  pauseUpdateResponse = false,
  settingUpdateResponse = 204,
  responses,
  updateResponse = {
    value: "anthropic/claude-sonnet-4-5",
    models: DEFAULT_RESPONSES.anthropic.models,
  },
}: SetupOptions = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  let resolveUpdateRequest: (() => void) | null = null;

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

  const settingsDefinitions: Record<
    MetabotSettingKey,
    MetabotSettingDefinition
  > = {
    "llm-metabot-provider": createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: savedProviderValue,
      is_env_setting: providerSettingIsEnv,
      env_name: providerSettingIsEnv ? providerSettingEnvName : undefined,
    }),
    "llm-anthropic-api-key": createMockSettingDefinition({
      key: "llm-anthropic-api-key",
      value: mergedApiKeyValues.anthropic ?? undefined,
    }),
    "llm-openai-api-key": createMockSettingDefinition({
      key: "llm-openai-api-key",
      value: mergedApiKeyValues.openai ?? undefined,
    }),
    "llm-openrouter-api-key": createMockSettingDefinition({
      key: "llm-openrouter-api-key",
      value: mergedApiKeyValues.openrouter ?? undefined,
    }),
  };

  fetchMock.get("path:/api/setting", () => Object.values(settingsDefinitions));

  const responseMap: Record<MetabotProvider, MetabotSettingsApiResponse> = {
    ...DEFAULT_RESPONSES,
    ...responses,
  };

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

  fetchMock.put("path:/api/metabot/settings", (call) => {
    if (pauseUpdateResponse) {
      return new Promise((resolve) => {
        resolveUpdateRequest = () => {
          resolve(handleMetabotSettingsUpdate(call));
        };
      });
    }

    return handleMetabotSettingsUpdate(call);
  });

  const handleMetabotSettingsUpdate = (call: { options?: RequestInit }) => {
    const body = JSON.parse(
      String(call.options?.body ?? "{}"),
    ) as MetabotSettingsUpdateBody;

    if ("api-key" in body) {
      const apiKeySettingKey =
        body.provider === "anthropic"
          ? "llm-anthropic-api-key"
          : body.provider === "openai"
            ? "llm-openai-api-key"
            : "llm-openrouter-api-key";
      const maskedApiKey = body["api-key"]
        ? `**********${String(body["api-key"]).slice(-2)}`
        : undefined;

      settingsDefinitions[apiKeySettingKey] = createMockSettingDefinition({
        ...settingsDefinitions[apiKeySettingKey],
        key: apiKeySettingKey,
        value: maskedApiKey,
      });
    }

    if ("model" in body) {
      sessionProperties["llm-metabot-provider"] = updateResponse.value;
      sessionProperties["llm-metabot-configured?"] = true;
      settingsDefinitions["llm-metabot-provider"] = createMockSettingDefinition(
        {
          ...settingsDefinitions["llm-metabot-provider"],
          key: "llm-metabot-provider",
          value: updateResponse.value,
        },
      );

      return updateResponse;
    }

    const providerResponse = responseMap[body.provider];
    const providerSettings =
      typeof providerResponse === "function"
        ? DEFAULT_RESPONSES[body.provider]
        : providerResponse;

    return {
      value: sessionProperties["llm-metabot-provider"],
      models: providerSettings.models,
    };
  };

  fetchMock.put("path:/api/setting", (call) => {
    if (settingUpdateResponse !== 204) {
      return settingUpdateResponse;
    }

    const body = JSON.parse(String(call.options?.body ?? "{}")) as Partial<
      Record<MetabotSettingKey, string | null>
    >;

    Object.entries(body).forEach(([key, nextValue]) => {
      if (key in settingsDefinitions) {
        settingsDefinitions[key as keyof typeof settingsDefinitions] =
          createMockSettingDefinition({
            ...settingsDefinitions[key as keyof typeof settingsDefinitions],
            key: key as keyof typeof settingsDefinitions,
            value: (nextValue ??
              undefined) as MetabotSettingDefinition["value"],
          });
      }

      if (key === "llm-metabot-provider") {
        sessionProperties["llm-metabot-provider"] =
          (nextValue as string | null) ?? null;
        sessionProperties["llm-metabot-configured?"] = Boolean(nextValue);
      }
    });

    return 204;
  });

  const { history, store } = renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotSetup} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot",
      storeInitialState: {
        settings,
      },
    },
  );

  if (!isHosted) {
    await screen.findByText(
      isConfigured
        ? /Connected to|Connect to an AI provider/
        : "Connect to an AI provider",
    );
  }

  return {
    history,
    store,
    resolveUpdateRequest: () => resolveUpdateRequest?.(),
  };
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
      savedProviderValue: null,
      isConfigured: false,
      providerSettingIsEnv: true,
      apiKeyValues: { anthropic: "**********45" },
    });

    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent(
      "This has been set by the LLM_METABOT_PROVIDER environment variable.",
    );
    expect(screen.getByLabelText("Provider")).toBeDisabled();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("shows Anthropic as selectable in the provider dropdown", async () => {
    await setup({ savedProviderValue: null, isConfigured: false });

    await userEvent.click(screen.getByLabelText("Provider"));

    const anthropicOption = await screen.findByRole("option", {
      name: "Anthropic",
    });
    expect(anthropicOption).toBeInTheDocument();
    expect(anthropicOption).not.toHaveAttribute("aria-disabled", "true");
  });

  it("shows Coming soon for non-Anthropic providers and disables them", async () => {
    await setup({ savedProviderValue: null, isConfigured: false });

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
    await screen.findByLabelText("API key");
    await screen.findByLabelText("Model");

    expect(
      await screen.findByText("Connected to Anthropic"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });

  it("shows the disconnected title when not configured", async () => {
    await setup({ savedProviderValue: null, isConfigured: false });

    expect(
      await screen.findByText("Connect to an AI provider"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Connected to /)).not.toBeInTheDocument();
  });

  it("does not preselect a provider in the disconnected state", async () => {
    await setup({
      savedProviderValue: "anthropic/claude-haiku-4-5",
      isConfigured: false,
    });

    expect(await screen.findByLabelText("Provider")).toHaveValue("");
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

    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("does not show the model selector when there is no API key", async () => {
    await setup({
      apiKeyValues: { anthropic: null },
    });

    await screen.findByLabelText("API key");
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("keeps the provider selector visible after verifying an API key", async () => {
    await setup({
      savedProviderValue: null,
      isConfigured: false,
      apiKeyValues: { anthropic: null },
    });

    await selectProvider("Anthropic");
    await userEvent.type(screen.getByLabelText("API key"), "sk-ant-valid");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await screen.findByLabelText("Model");
    expect(screen.getByLabelText("Provider")).toHaveValue("Anthropic");
  });

  it("shows the connected Metabase-managed state without an API key or model picker", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    expect(
      await screen.findByText("Current billing cycle"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
  });

  it("shows pricing details in a tooltip for the Metabase provider", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      isConfigured: false,
    });

    await selectProvider("Metabase");
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

    await selectProvider("Metabase");
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
      savedProviderValue: null,
      isConfigured: false,
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
        name: /I agree with the Metabase AI Service/i,
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

      await selectProvider("Metabase");
      const termsCheckbox = await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
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
      expect(
        screen.getByRole("button", { name: "Disconnect" }),
      ).toBeInTheDocument();

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

  it("saves when picking a model", async () => {
    const { store } = await setup({
      savedProviderValue: null,
      isConfigured: false,
    });
    await selectProvider("Anthropic");
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

    await waitFor(() => {
      expect(
        store
          .getState()
          .undo.some(
            (toast) => toast.message === "Settings saved successfully",
          ),
      ).toBe(true);
    });

    expect(
      screen.queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();
  });

  it("disconnects an API-key provider by clearing both the provider and API key settings", async () => {
    await setup();

    await screen.findByLabelText("API key");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/setting")).toBe(true);
    });

    const request = fetchMock.callHistory
      .calls("path:/api/setting")
      .find((call) => call.request?.method === "PUT");

    expect(request?.options?.body).toBe(
      JSON.stringify({
        "llm-metabot-provider": null,
        "llm-anthropic-api-key": null,
      }),
    );

    expect(
      await screen.findByText("Connect to an AI provider"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Provider")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Disconnect" }),
    ).not.toBeInTheDocument();
  });

  it("disconnects the Metabase-managed provider without clearing an API key", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    await screen.findByText("Current billing cycle");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/setting")).toBe(true);
    });

    const request = fetchMock.callHistory
      .calls("path:/api/setting")
      .find((call) => call.request?.method === "PUT");

    expect(request?.options?.body).toBe(
      JSON.stringify({
        "llm-metabot-provider": null,
      }),
    );
  });

  it("shows an error toast when disconnect fails", async () => {
    const { store } = await setup({ settingUpdateResponse: { status: 500 } });

    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => {
      expect(
        store
          .getState()
          .undo.some(
            (toast) => toast.message === "Unable to save provider settings.",
          ),
      ).toBe(true);
    });
  });
});
