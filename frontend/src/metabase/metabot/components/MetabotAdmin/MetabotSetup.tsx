import { useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  skipToken,
  useGetMetabotSettingsQuery,
  useUpdateMetabotSettingsMutation,
} from "metabase/api";
import {
  getErrorMessage,
  useAdminSetting,
  useAdminSettings,
} from "metabase/api/utils";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import {
  Badge,
  type ComboboxItem,
  Flex,
  Group,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
  SettingDefinition,
} from "metabase-types/api";

import { MetabotNavPane } from "./MetabotNavPane";
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

export function MetabotSetup() {
  const dispatch = useDispatch();
  const isHosted = useSetting("is-hosted?");

  useEffect(() => {
    if (isHosted) {
      dispatch(push("/admin/metabot/"));
    }
  }, [dispatch, isHosted]);

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

  const isConnected =
    !updateMetabotSettingsResult.isLoading &&
    savedProvider &&
    savedModel &&
    isConfigured;

  const [provider, setProvider] = useState<MetabotProvider | null>(
    savedProvider,
  );
  const providerDetails = provider ? PROVIDER_OPTIONS?.[provider] : null;

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
        : (metabotSettingsQuery.data?.models ?? []).map(
            (model: MetabotSettingsResponse["models"][number]) => ({
              value: model.id,
              label: model.display_name,
              group: model.group,
            }),
          ),
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
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsSection
        title={
          <Flex justify="space-between" align="center">
            <div>{t`Connect to AI Provider`}</div>
            {isConnected ? (
              <Badge bg="success" variant="filled" size="sm">
                {t`Connected`}
              </Badge>
            ) : (
              <Badge
                bg="background-disabled"
                c="text-tertiary"
                variant="filled"
                size="sm"
              >
                {t`Not connected`}
              </Badge>
            )}
          </Flex>
        }
        description={t`Select your AI provider and configure your API key to get started with Metabot.`}
      >
        <Stack gap="md">
          <Select
            label={t`Provider`}
            placeholder={t`Select a provider`}
            description={
              providerDetails
                ? getProviderDescription(providerDetails.value)
                : null
            }
            data={Object.values(PROVIDER_OPTIONS).map(({ label, value }) => ({
              label,
              value,
              disabled: value !== "anthropic",
            }))}
            value={provider}
            onChange={handleProviderChange}
            disabled={isEnvSetting}
            renderOption={({ option }) => (
              <Group
                gap="xs"
                p="sm"
                justify="space-between"
                wrap="nowrap"
                w="100%"
              >
                <Text
                  lh="1rem"
                  c={option.disabled ? "text-tertiary" : undefined}
                >
                  {option.label}
                </Text>
                {option.value !== "anthropic" ? (
                  <Text c="text-tertiary" lh="1rem" size="sm">
                    {t`Coming soon`}
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

          {saveError ? (
            <Text size="sm" c="error">
              {saveError}
            </Text>
          ) : null}
        </Stack>
      </SettingsSection>
    </AdminSettingsLayout>
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
