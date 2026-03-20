import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { skipToken } from "metabase/api";
import {
  getErrorMessage,
  useAdminSetting,
  useAdminSettings,
} from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import {
  Badge,
  type ComboboxItem,
  Group,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import {
  useGetMetabotSettingsQuery,
  useUpdateMetabotSettingsMutation,
} from "metabase-enterprise/api";
import type { MetabotProvider, SettingDefinition } from "metabase-types/api";

import { MetabotProviderApiKey } from "./MetabotProviderApiKey";
import { API_KEY_SETTING_BY_PROVIDER, PROVIDER_OPTIONS } from "./utils";

type MetabotModelOption = ComboboxItem & {
  group?: string | null;
};

type SelectModelOption = ComboboxItem;

type MetabotModelGroup = {
  group: string;
  items: SelectModelOption[];
};

type MetabotModelSelectData = MetabotModelOption[] | MetabotModelGroup[];

export function MetabotProviderSection() {
  const isConfigured = useSetting("llm-metabot-configured?");
  const { value: savedProviderValue, settingDetails } = useAdminSetting(
    "llm-metabot-provider",
  );
  const isEnvSetting =
    settingDetails &&
    !!settingDetails.is_env_setting &&
    !!settingDetails.env_name;

  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
  ] as const);

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const { provider: savedProvider, model: savedModel } = useMemo(
    () =>
      parseProviderAndModel(savedProviderValue as string | null | undefined),
    [savedProviderValue],
  );

  const [provider, setProvider] = useState<MetabotProvider | null>(
    savedProvider,
  );
  const providerDetails = provider ? PROVIDER_OPTIONS[provider] : null;

  const [modelInputValue, setModelInputValue] = useState(savedModel);

  useEffect(() => {
    setProvider(savedProvider);
    setModelInputValue(savedModel);
  }, [savedModel, savedProvider]);

  const selectedApiKeySetting = provider
    ? API_KEY_SETTING_BY_PROVIDER[provider]
    : null;
  const hasSelectedProviderApiKey = selectedApiKeySetting
    ? hasConfiguredSettingValue(providerApiKeyDetails[selectedApiKeySetting])
    : false;

  const metabotSettingsQuery = useGetMetabotSettingsQuery(
    provider ? { provider } : skipToken,
  );

  const modelOptions = useMemo<MetabotModelOption[]>(
    () =>
      metabotSettingsQuery.isFetching
        ? []
        : (metabotSettingsQuery.data?.models ?? []).map((model) => ({
            value: model.id,
            label: model.display_name,
            group: model.group,
          })),
    [metabotSettingsQuery.isFetching, metabotSettingsQuery.data?.models],
  );
  const groupedModelOptions = useMemo<MetabotModelSelectData>(
    () => getGroupedModelOptions(modelOptions),
    [modelOptions],
  );

  const apiKeyError = metabotSettingsQuery.data?.["api-key-error"] ?? null;
  const modelError = getModelError({
    error: metabotSettingsQuery.error,
    provider,
  });
  const saveError = updateMetabotSettingsResult.error
    ? getErrorMessage(
        updateMetabotSettingsResult,
        t`Unable to save provider settings.`,
      )
    : null;

  const handleProviderChange = (value: string | null) => {
    if (!isMetabotProvider(value)) {
      setProvider(null);
      setModelInputValue(null);
      return;
    }

    setProvider(value);
    setModelInputValue(value === savedProvider ? (savedModel ?? null) : null);
  };

  const handleModelChange = async (value: string | null) => {
    setModelInputValue(value);

    if (!provider || !value) {
      return;
    }

    await updateMetabotSettings({ provider, model: value });
  };

  return (
    <Stack gap="md">
      <Select
        label={t`Provider`}
        placeholder={t`Select a provider`}
        description={
          providerDetails ? getProviderDescription(providerDetails.value) : null
        }
        data={Object.values(PROVIDER_OPTIONS).map(({ label, value }) => ({
          label,
          value,
        }))}
        value={provider}
        onChange={handleProviderChange}
        disabled={isEnvSetting}
        renderOption={({ option }) => (
          <Group gap="xs" p="sm">
            <Text lh="1rem">{option.label}</Text>
            {option.value === "anthropic" ? (
              <Text c="text-secondary" lh="1rem">
                - {t`Recommended`}
              </Text>
            ) : null}
          </Group>
        )}
      />

      {provider ? (
        <MetabotProviderApiKey provider={provider} error={apiKeyError} />
      ) : null}

      {provider && hasSelectedProviderApiKey && !apiKeyError && (
        <Select
          label={t`Model`}
          placeholder={
            provider
              ? metabotSettingsQuery.isFetching
                ? t`Loading models...`
                : t`Select a model`
              : t`Select a provider first`
          }
          description={t`Available models are fetched from the selected provider using its configured API key.`}
          error={modelError}
          data={groupedModelOptions}
          value={modelInputValue}
          onChange={handleModelChange}
          disabled={
            isEnvSetting ||
            !provider ||
            !hasSelectedProviderApiKey ||
            !!apiKeyError
          }
          searchable
          nothingFoundMessage={t`No models found`}
        />
      )}

      {isEnvSetting && settingDetails.env_name && (
        <SetByEnvVar varName={settingDetails.env_name} />
      )}

      {updateMetabotSettingsResult.isLoading ? (
        <Text size="sm" c="text-secondary">
          {t`Saving provider settings...`}
        </Text>
      ) : null}

      {!updateMetabotSettingsResult.isLoading &&
      savedProvider &&
      savedModel &&
      isConfigured ? (
        <Group gap="sm">
          <Badge bg="success" variant="filled" size="sm">
            {t`Connected`}
          </Badge>
          <Text size="sm" c="text-secondary">
            {c("{0} is an AI provider name and {1} is a model name")
              .t`Using ${PROVIDER_OPTIONS[savedProvider]?.label} with ${getModelDisplayName(modelOptions, savedModel)}`}
          </Text>
        </Group>
      ) : null}

      {saveError ? (
        <Text size="sm" c="error">
          {saveError}
        </Text>
      ) : null}
    </Stack>
  );
}

function isMetabotProvider(
  value: string | null | undefined,
): value is MetabotProvider {
  return value === "anthropic" || value === "openai" || value === "openrouter";
}

function parseProviderAndModel(value: string | null | undefined) {
  if (!value) {
    return { provider: null, model: null };
  }

  const [provider, model] = value.split(/\/(.+)/, 2);

  if (!isMetabotProvider(provider) || !model) {
    return { provider: null, model: null };
  }

  return { provider, model };
}

function getProviderDescription(provider: MetabotProvider) {
  return match(provider)
    .with(
      "anthropic",
      () => t`Use Anthropic models directly with your Anthropic API key.`,
    )
    .with(
      "openai",
      () => t`Use OpenAI models directly with your OpenAI API key.`,
    )
    .with(
      "openrouter",
      () =>
        t`Use OpenRouter to access models from multiple providers with one API key.`,
    )
    .exhaustive();
}

function hasConfiguredSettingValue(setting: SettingDefinition | undefined) {
  return Boolean(setting?.value || setting?.is_env_setting);
}

function getModelDisplayName(
  modelOptions: MetabotModelOption[],
  model: string | null | undefined,
) {
  return modelOptions.find((option) => option.value === model)?.label ?? model;
}

function getGroupedModelOptions(
  modelOptions: MetabotModelOption[],
): MetabotModelSelectData {
  const groups = new Map<string, SelectModelOption[]>();
  const ungrouped: SelectModelOption[] = [];

  for (const option of modelOptions) {
    const selectOption = { value: option.value, label: option.label };

    if (!option.group) {
      ungrouped.push(selectOption);
      continue;
    }

    const group = groups.get(option.group) ?? [];
    group.push(selectOption);
    groups.set(option.group, group);
  }

  if (groups.size === 0) {
    return ungrouped;
  }

  if (ungrouped.length > 0) {
    groups.set(t`Other`, ungrouped);
  }

  return Array.from(groups.entries()).map(([group, items]) => ({
    group,
    items,
  }));
}

function getModelError({
  error,
  provider,
}: {
  error: unknown;
  provider: MetabotProvider | null;
}) {
  if (!provider) {
    return undefined;
  }

  if (error) {
    return getErrorMessage(error, t`Unable to load models.`);
  }

  return undefined;
}
