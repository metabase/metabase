import { t } from "ttag";

import type { MetabotProvider, SettingDefinition } from "metabase-types/api";

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
    azure: {
      value: "azure",
      label: "Microsoft Azure",
      apiKey: {
        // Azure data-plane keys have no recognizable prefix
        placeholder: t`Enter your Azure API key`,
        addKeyUrl: "https://ai.azure.com",
      },
    },
    bedrock: {
      value: "bedrock",
      label: "Amazon Bedrock",
      apiKey: {
        placeholder: "AKIA...",
        addKeyUrl:
          "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
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
  "metabase" | "azure" | "bedrock"
>;

export function isMetabotProvider(
  value: string | null | undefined,
): value is MetabotProvider {
  return !!value && value in getProviderOptions(true);
}

export function isAvailableProvider(provider: MetabotProvider): boolean {
  return (
    provider === "anthropic" ||
    provider === "azure" ||
    provider === "bedrock" ||
    provider === "metabase"
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

export const AZURE_MODEL_FAMILIES = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
] as const;

export function parseAzureModel(model: string | undefined) {
  const [family, deployment] = model?.split(/\/(.+)/, 2) ?? [];
  return { family, deployment };
}

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

export const hasConfiguredSettingValue = (
  setting: SettingDefinition | undefined,
) => Boolean(setting?.value || setting?.is_env_setting);
