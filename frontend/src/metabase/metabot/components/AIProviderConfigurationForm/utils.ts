import type { MetabotProvider } from "metabase-types/api";

type ApiKeylessProviders = "metabase";
type ApiKeyProviders = Exclude<MetabotProvider, ApiKeylessProviders>;

type MetabotApiKeylessProviderOption = {
  value: ApiKeylessProviders;
  label: string;
};

type MetabotApiKeyProviderOption = {
  value: ApiKeyProviders;
  label: string;
  apiKey: {
    placeholder: string;
    addKeyUrl: string;
  };
};

export type MetabotProviderOption =
  | MetabotApiKeylessProviderOption
  | MetabotApiKeyProviderOption;

export function getProviderOptions(
  hasMetabaseProviderAccess: boolean,
): Partial<Record<ApiKeylessProviders, MetabotApiKeylessProviderOption>> &
  Record<ApiKeyProviders, MetabotApiKeyProviderOption> {
  return {
    ...(hasMetabaseProviderAccess && {
      metabase: {
        value: "metabase" as const,
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- "Metabase" is the product name for the managed AI provider option, only shown to admins configuring AI.
        label: "Metabase",
      },
    }),
    anthropic: {
      value: "anthropic",
      label: "Anthropic",
      apiKey: {
        placeholder: "sk-ant-api03-...",
        addKeyUrl: "https://console.anthropic.com/settings/keys",
      },
    },
    openai: {
      value: "openai",
      label: "OpenAI",
      apiKey: {
        placeholder: "sk-proj-...",
        addKeyUrl: "https://platform.openai.com/api-keys",
      },
    },
    openrouter: {
      value: "openrouter",
      label: "OpenRouter",
      apiKey: {
        placeholder: "sk-or-v1-...",
        addKeyUrl: "https://openrouter.ai/keys",
      },
    },
  };
}

export type MetabotApiKeyProvider = Exclude<
  MetabotProvider,
  ApiKeylessProviders
>;

export function isMetabotProvider(
  value: string | null | undefined,
): value is MetabotProvider {
  return !!value && value in getProviderOptions(true);
}

export function isApiKeyMetabotProvider(
  provider: MetabotProvider,
): provider is MetabotApiKeyProvider {
  return "apiKey" in (getProviderOptions(true)[provider] ?? {});
}

export function isAvailableProvider(provider: MetabotProvider): boolean {
  return (
    provider === "anthropic" || provider === "openai" || provider === "metabase"
  );
}

export const API_KEY_SETTING_BY_PROVIDER: Record<
  MetabotApiKeyProvider,
  "llm-anthropic-api-key" | "llm-openai-api-key" | "llm-openrouter-api-key"
> = {
  anthropic: "llm-anthropic-api-key",
  openai: "llm-openai-api-key",
  openrouter: "llm-openrouter-api-key",
};

export const BASE_URL_SETTING_BY_PROVIDER = {
  anthropic: "llm-anthropic-api-base-url",
  openai: "llm-openai-api-base-url",
} as const;

export type MetabotBaseUrlProvider = keyof typeof BASE_URL_SETTING_BY_PROVIDER;

export function isBaseUrlProvider(
  provider: MetabotProvider,
): provider is MetabotBaseUrlProvider {
  return provider in BASE_URL_SETTING_BY_PROVIDER;
}

export const DEFAULT_BASE_URL_BY_PROVIDER: Record<
  MetabotBaseUrlProvider,
  string
> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};

// The URL is used exactly as entered (the adapters append /v1/... to it), so the help text
// must show the full compatible-surface path Azure admins need.
export const AZURE_BASE_URL_EXAMPLE_BY_PROVIDER: Record<
  MetabotBaseUrlProvider,
  string
> = {
  anthropic: "https://<resource>.services.ai.azure.com/anthropic",
  openai: "https://<resource>.services.ai.azure.com/openai",
};

export function parseProviderAndModel(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const [provider, model] = value.split(/\/(.+)/, 2);
  if (!isMetabotProvider(provider) || !model) {
    return undefined;
  }

  return { provider, model };
}
