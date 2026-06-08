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
    google: {
      value: "google",
      label: "Google",
      apiKey: {
        placeholder: "AIza...",
        addKeyUrl: "https://aistudio.google.com/apikey",
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
    provider === "anthropic" || provider === "metabase" || provider === "google"
  );
}

export const API_KEY_SETTING_BY_PROVIDER: Record<
  MetabotApiKeyProvider,
  | "llm-anthropic-api-key"
  | "llm-openai-api-key"
  | "llm-openrouter-api-key"
  | "llm-google-api-key"
> = {
  anthropic: "llm-anthropic-api-key",
  openai: "llm-openai-api-key",
  openrouter: "llm-openrouter-api-key",
  google: "llm-google-api-key",
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
