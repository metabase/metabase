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
import { defer } from "metabase/utils/promise";
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

import { MetabotSetup, MetabotSetupInner } from "./MetabotSetup";
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
  is_locked?: boolean;
  tokens: number | null;
  free_tokens?: number | null;
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
  hasDeprecatedMetabaseAiProvider?: boolean;
  offerMetabaseManagedAi?: boolean;
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
  deferPurchaseCloudAddOnResponse?: boolean;
  removeCloudAddOnResponse?: number | { status: number; body: unknown };
  apiKeyValues?: Partial<Record<MetabotProvider, string | null>>;
  pauseUpdateResponse?: boolean;
  deferMetabotSettingsUpdateResponse?: boolean;
  settingUpdateResponse?: number | { status: number; body?: unknown };
  responses?: Partial<Record<MetabotProvider, MetabotSettingsApiResponse>>;
  updateResponse?: MetabotSettingsResponse;
  renderAsModal?: boolean;
  onClose?: jest.Mock;
};

async function setup({
  isHosted = false,
  hasDeprecatedMetabaseAiProvider,
  offerMetabaseManagedAi,
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
  deferPurchaseCloudAddOnResponse = false,
  removeCloudAddOnResponse = 200,
  apiKeyValues,
  pauseUpdateResponse = false,
  deferMetabotSettingsUpdateResponse = false,
  settingUpdateResponse = 204,
  responses,
  updateResponse = {
    value: "anthropic/claude-sonnet-4-5",
    models: DEFAULT_RESPONSES.anthropic.models,
  },
  renderAsModal = false,
  onClose = jest.fn(),
}: SetupOptions = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const purchaseCloudAddOnDeferred = defer<void>();
  const updateMetabotSettingsDeferred = defer<void>();

  const mergedApiKeyValues: Record<MetabotApiKeyProvider, string | null> = {
    anthropic: "**********45",
    openai: null,
    openrouter: null,
    ...apiKeyValues,
  };

  const createTokenFeatureFlags = (features: TokenStatusFeature[]) =>
    createMockTokenFeatures({
      hosting: isHosted,
      "offer-metabase-ai-managed":
        offerMetabaseManagedAi ??
        (isHosted || features.includes("offer-metabase-ai-managed")),
      "metabase-ai-managed": features.includes("metabase-ai-managed"),
      "metabot-v3":
        hasDeprecatedMetabaseAiProvider ?? features.includes("metabot-v3"),
    });

  const sessionProperties = createMockSettings({
    "is-hosted?": isHosted,
    "llm-proxy-configured?": llmProxyConfigured,
    "llm-metabot-provider": savedProviderValue,
    "llm-metabot-configured?": isConfigured,
    "token-features": createTokenFeatureFlags(tokenStatusFeatures),
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
      purchaseCloudAddOnResponse: deferPurchaseCloudAddOnResponse
        ? async () => {
            await purchaseCloudAddOnDeferred.promise;
            return purchaseCloudAddOnResponse;
          }
        : purchaseCloudAddOnResponse,
      removeCloudAddOnResponse,
    });

    fetchMock.post("path:/api/premium-features/token/refresh", () => {
      sessionProperties["token-features"] = createTokenFeatureFlags(
        refreshedTokenStatusFeatures,
      );
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
      return new Promise(() => undefined);
    }

    if (deferMetabotSettingsUpdateResponse) {
      return updateMetabotSettingsDeferred.promise.then(() =>
        handleMetabotSettingsUpdate(call),
      );
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

  const storeInitialState = { settings };
  const view = renderAsModal
    ? renderWithProviders(<MetabotSetupInner isModal onClose={onClose} />, {
        storeInitialState,
      })
    : renderWithProviders(
        <Route path="/admin/metabot*" component={MetabotSetup} />,
        {
          withRouter: true,
          initialRoute: "/admin/metabot",
          storeInitialState,
        },
      );

  if (!isHosted && !renderAsModal) {
    await screen.findByText(
      isConfigured
        ? /Connected to|Connect to an AI provider/
        : "Connect to an AI provider",
    );
  }

  return {
    ...view,
    onClose,
    resolvePurchaseCloudAddOnResponse: () =>
      purchaseCloudAddOnDeferred.resolve(),
    resolveMetabotSettingsUpdateResponse: () =>
      updateMetabotSettingsDeferred.resolve(),
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

  it("shows Connect instead of Disconnect when the configured API key input is dirty", async () => {
    await setup();
    await screen.findByLabelText("API key");

    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("API key"));
    await userEvent.type(screen.getByLabelText("API key"), "sk-ant-rotated");

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disconnect" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
        true,
      );
    });

    const request = fetchMock.callHistory
      .calls("path:/api/metabot/settings")
      .find(
        (call) =>
          call.request?.method === "PUT" || call.options?.method === "PUT",
      );

    expect(request?.options?.body).toBe(
      JSON.stringify({ provider: "anthropic", "api-key": "sk-ant-rotated" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Disconnect" }),
      ).toBeInTheDocument();
    });
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
      tokenStatusFeatures: ["metabase-ai-managed"],
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

  it("explains the legacy Metabase AI pricing migration", async () => {
    await setup({
      isHosted: true,
      hasDeprecatedMetabaseAiProvider: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    expect(
      await screen.findByText(
        "You're on legacy tiered AI pricing today. On your next billing cycle, you'll switch to metered AI pricing. If you'd like to switch to a third-party AI provider and use their API, click Disconnect.",
      ),
    ).toBeInTheDocument();
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

    const [settingsRequest] = fetchMock.callHistory.calls(
      "path:/api/metabot/settings",
      {
        method: "PUT",
      },
    );

    expect(settingsRequest?.options?.body).toBe(
      JSON.stringify({ provider: "metabase", model: "" }),
    );
  });

  it("calls onClose after directly connecting to the Metabase provider in modal mode", async () => {
    const onClose = jest.fn();

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
      renderAsModal: true,
      onClose,
    });

    await selectProvider("Metabase");
    await userEvent.click(
      await screen.findByRole("button", { name: "Connect" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/metabot/settings")
          .some(
            (call) =>
              call.request?.method === "PUT" || call.options?.method === "PUT",
          ),
      ).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("waits for the purchase and settings save before showing Metabase AI as ready", async () => {
    let resolvePurchaseCloudAddOnResponse = () => {};
    let resolveMetabotSettingsUpdateResponse = () => {};

    try {
      jest.useFakeTimers({ advanceTimers: true });
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      ({
        resolvePurchaseCloudAddOnResponse,
        resolveMetabotSettingsUpdateResponse,
      } = await setup({
        isHosted: true,
        savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
        isConfigured: false,
        isStoreUser: true,
        tokenStatusFeatures: [],
        refreshedTokenStatusFeatures: ["metabase-ai-managed"],
        deferPurchaseCloudAddOnResponse: true,
        deferMetabotSettingsUpdateResponse: true,
        updateResponse: {
          value: "metabase/anthropic/claude-sonnet-4-6",
          models: DEFAULT_RESPONSES.metabase.models,
        },
      }));

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
      expect(screen.queryByText("Metabot AI is ready")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Current billing cycle"),
      ).not.toBeInTheDocument();

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/ee/cloud-add-ons/metabase-ai-managed",
          ),
        ).toBe(true);
      });

      const [request] = fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
        {
          method: "POST",
        },
      );

      expect(request?.options?.body).toBe(
        JSON.stringify({ terms_of_service: true }),
      );

      expect(
        fetchMock.callHistory
          .calls("path:/api/metabot/settings")
          .some(
            (call) =>
              call.request?.method === "PUT" || call.options?.method === "PUT",
          ),
      ).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/premium-features/token/refresh",
          ),
        ).toBe(true);
      });

      expect(
        screen.getByText("Setting up Metabot AI, please wait"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Metabot AI is ready")).not.toBeInTheDocument();
      expect(
        fetchMock.callHistory
          .calls("path:/api/metabot/settings")
          .some(
            (call) =>
              call.request?.method === "PUT" || call.options?.method === "PUT",
          ),
      ).toBe(false);

      await act(async () => {
        resolvePurchaseCloudAddOnResponse();
        await Promise.resolve();
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
        screen.getByText("Setting up Metabot AI, please wait"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Metabot AI is ready")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Current billing cycle"),
      ).not.toBeInTheDocument();

      await act(async () => {
        resolveMetabotSettingsUpdateResponse();
        await Promise.resolve();
      });

      expect(
        await screen.findByRole("button", { name: "Done" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Metabot AI is ready")).toBeInTheDocument();
      expect(screen.getByText("Current billing cycle")).toBeInTheDocument();
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

      const callHistory = fetchMock.callHistory.calls();
      const [purchaseRequest] = fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
        {
          method: "POST",
        },
      );

      if (!settingsRequest || !purchaseRequest) {
        throw new Error("Expected purchase and settings requests to exist");
      }

      expect(callHistory.indexOf(purchaseRequest)).toBeLessThan(
        callHistory.indexOf(settingsRequest),
      );
    } finally {
      resolvePurchaseCloudAddOnResponse();
      resolveMetabotSettingsUpdateResponse();
      jest.useRealTimers();
    }
  });

  it("calls onClose after purchasing the Metabase add-on and connecting in modal mode", async () => {
    const onClose = jest.fn();
    const {
      resolvePurchaseCloudAddOnResponse,
      resolveMetabotSettingsUpdateResponse,
    } = await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      isConfigured: false,
      isStoreUser: true,
      tokenStatusFeatures: [],
      refreshedTokenStatusFeatures: ["metabase-ai-managed"],
      deferPurchaseCloudAddOnResponse: true,
      deferMetabotSettingsUpdateResponse: true,
      updateResponse: {
        value: "metabase/anthropic/claude-sonnet-4-6",
        models: DEFAULT_RESPONSES.metabase.models,
      },
      renderAsModal: true,
      onClose,
    });

    await selectProvider("Metabase");

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Connect" }),
    );

    expect(onClose).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-add-ons/metabase-ai-managed",
        ),
      ).toBe(true);
    });

    await act(async () => {
      resolvePurchaseCloudAddOnResponse();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/metabot/settings")
          .some(
            (call) =>
              call.request?.method === "PUT" || call.options?.method === "PUT",
          ),
      ).toBe(true);
    });

    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveMetabotSettingsUpdateResponse();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows live pricing for the Metabase provider", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      tokenStatusFeatures: ["metabase-ai-managed"],
      metabasePricePerUnit: 4.25,
    });

    expect(await screen.findByText("Price per token")).toBeInTheDocument();
    expect(screen.getByText("$4.25 per 1M tokens")).toBeInTheDocument();
  });

  it("shows included usage for the connected Metabase provider while still within the free limit", async () => {
    const updatedAt = "2026-04-02T19:29:12Z";
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      tokenStatusFeatures: ["metabase-ai-managed"],
      metabasePricePerUnit: 4.25,
      metabotUsageQuotas: [
        {
          tokens: 250000,
          free_tokens: 1000000,
          updated_at: updatedAt,
        },
      ],
    });

    expect(await screen.findByText("Included use")).toBeInTheDocument();
    expect(screen.getByText("Free trial tokens")).toBeInTheDocument();
    expect(screen.getByText("250,000 / 1,000,000")).toBeInTheDocument();
    expect(screen.getByText("Price per token afterward")).toBeInTheDocument();
    expect(screen.queryByText("Current billing cycle")).not.toBeInTheDocument();
    expect(screen.queryByText("Total tokens")).not.toBeInTheDocument();
  });

  it("shows the normal usage summary for the connected Metabase provider after free tokens run out", async () => {
    const updatedAt = "2026-04-02T19:29:12Z";
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      tokenStatusFeatures: ["metabase-ai-managed"],
      metabasePricePerUnit: 4.25,
      metabotUsageQuotas: [
        {
          tokens: 1250000,
          free_tokens: 1000000,
          updated_at: updatedAt,
        },
      ],
    });

    expect(
      await screen.findByText("Current billing cycle"),
    ).toBeInTheDocument();
    expect(await screen.findByText("1,250,000")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getByText("Total cost")).toBeInTheDocument();
    expect(screen.getByText("Price per token")).toBeInTheDocument();
    expect(screen.getByText("$1.06")).toBeInTheDocument();
    expect(screen.queryByText("Included use")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Price per token afterward"),
    ).not.toBeInTheDocument();
  });

  it("disconnects when clicking use a different AI provider from the locked managed-provider state", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      tokenStatusFeatures: ["metabase-ai-managed"],
      metabotUsageQuotas: [
        {
          is_locked: true,
          tokens: 250000,
          updated_at: "2026-04-02T19:29:12Z",
        },
      ],
    });

    expect(
      await screen.findByText("You've run out of AI service tokens"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You've used all of your included AI service tokens\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("Current billing cycle")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use a different AI provider" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Use a different AI provider" }),
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

    expect(
      await screen.findByText("Connect to an AI provider"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Provider")).toHaveValue("");
    expect(
      screen.queryByText("You've run out of AI service tokens"),
    ).not.toBeInTheDocument();
  });

  it("resets the form in modal mode without updating settings", async () => {
    await setup({
      isHosted: true,
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      tokenStatusFeatures: ["metabase-ai-managed"],
      metabotUsageQuotas: [
        {
          is_locked: true,
          tokens: 250000,
          updated_at: "2026-04-02T19:29:12Z",
        },
      ],
      renderAsModal: true,
    });

    expect(await screen.findByLabelText("Provider")).toHaveValue("");

    await selectProvider("Metabase");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Use a different AI provider",
      }),
    );

    expect(await screen.findByLabelText("Provider")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Use a different AI provider" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory
        .calls("path:/api/setting")
        .some((call) => call.request?.method === "PUT"),
    ).toBe(false);
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

    const [request] = fetchMock.callHistory.calls(
      "path:/api/metabot/settings",
      {
        method: "PUT",
      },
    );

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

    const [request] = fetchMock.callHistory.calls("path:/api/setting", {
      method: "PUT",
    });

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

  it("disconnects the Metabase-managed provider by removing the add-on before clearing the provider setting", async () => {
    await setup({
      isHosted: true,
      tokenStatusFeatures: ["metabase-ai-managed", "offer-metabase-ai-managed"],
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    await screen.findByText("Connected to Metabase");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/cloud-add-ons/metabase-ai-tiered",
      ),
    ).toBe(false);
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-add-ons/metabase-ai-managed",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/setting")).toBe(true);
    });

    const [removeRequest] = fetchMock.callHistory.calls(
      "path:/api/ee/cloud-add-ons/metabase-ai-managed",
      {
        method: "DELETE",
      },
    );
    const [request] = fetchMock.callHistory.calls("path:/api/setting", {
      method: "PUT",
    });

    expect(removeRequest).toBeDefined();
    expect(request?.options?.body).toBe(
      JSON.stringify({
        "llm-metabot-provider": null,
      }),
    );

    const callHistory = fetchMock.callHistory.calls();

    expect(
      callHistory.indexOf(removeRequest as (typeof callHistory)[number]),
    ).toBeLessThan(
      callHistory.indexOf(request as (typeof callHistory)[number]),
    );
  });

  it("disconnects the tiered Metabase provider by removing the add-on before clearing the provider setting", async () => {
    await setup({
      isHosted: true,
      tokenStatusFeatures: ["metabot-v3", "offer-metabase-ai-managed"],
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    await screen.findByText("Connected to Metabase");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
      ),
    ).toBe(false);
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-add-ons/metabase-ai-tiered",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/setting")).toBe(true);
    });

    const [removeRequest] = fetchMock.callHistory.calls(
      "path:/api/ee/cloud-add-ons/metabase-ai-tiered",
      {
        method: "DELETE",
      },
    );
    const [request] = fetchMock.callHistory.calls("path:/api/setting", {
      method: "PUT",
    });

    expect(removeRequest).toBeDefined();
    expect(request?.options?.body).toBe(
      JSON.stringify({
        "llm-metabot-provider": null,
      }),
    );

    const callHistory = fetchMock.callHistory.calls();

    expect(
      callHistory.indexOf(removeRequest as (typeof callHistory)[number]),
    ).toBeLessThan(
      callHistory.indexOf(request as (typeof callHistory)[number]),
    );
  });

  it("does not disconnect the tiered Metabase provider if no offer-metabase-ai-managed is set", async () => {
    await setup({
      isHosted: true,
      offerMetabaseManagedAi: false,
      tokenStatusFeatures: ["metabot-v3"],
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
    });

    await screen.findByText("Connected to Metabase");

    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
      ),
    ).toBe(false);
    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/cloud-add-ons/metabase-ai-tiered",
      ),
    ).toBe(false);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/setting", { method: "PUT" }),
      ).toBe(true);
    });

    const [request] = fetchMock.callHistory.calls("path:/api/setting", {
      method: "PUT",
    });

    expect(request?.options?.body).toBe(
      JSON.stringify({
        "llm-metabot-provider": null,
      }),
    );
  });

  it("does not clear the provider setting if removing the Metabase-managed add-on fails", async () => {
    await setup({
      isHosted: true,
      tokenStatusFeatures: ["metabase-ai-managed"],
      savedProviderValue: "metabase/anthropic/claude-sonnet-4-6",
      removeCloudAddOnResponse: 500,
    });

    await screen.findByText("Current billing cycle");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Unable to disconnect from this AI provider."),
      ).toBeInTheDocument();
    });

    expect(
      fetchMock.callHistory
        .calls("path:/api/setting")
        .some((call) => call.request?.method === "PUT"),
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
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
