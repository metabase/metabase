import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

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
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
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

import { MetabotProviderApiKey } from "./MetabotProviderApiKey";
import {
  API_KEY_SETTING_BY_PROVIDER,
  getProviderOptions,
  isApiKeyMetabotProvider,
  isAvailableProvider,
  isMetabotProvider,
  parseProviderAndModel,
} from "./utils";

type MetabotModelOption = ComboboxItem & {
  group?: string | null;
};

function getModelDescription(provider: MetabotProvider | undefined) {
  if (provider === "metabase") {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
    return t`Available models are provided by Metabase.`;
  }

  return t`Available models are fetched from the selected provider using its configured API key.`;
}

export function MetabotSetup() {
  const MetabaseAIProviderSetup = PLUGIN_METABOT.MetabaseAIProviderSetup;
  const offerMetabaseAiManaged = PLUGIN_METABOT.isEnabled;

  const { value, settingDetails } = useAdminSetting("llm-metabot-provider");
  const isEnvSetting =
    !!settingDetails &&
    !!settingDetails.is_env_setting &&
    !!settingDetails.env_name;
  const envSettingName = isEnvSetting ? settingDetails?.env_name : undefined;

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();
  const savedProviderValue = updateMetabotSettingsResult.data?.value ?? value;
  const config = useMemo(
    () => parseProviderAndModel(savedProviderValue),
    [savedProviderValue],
  );
  const [provider, setProvider] = useState<MetabotProvider | undefined>(
    config?.provider,
  );
  const [model, setModel] = useState<string>(config?.model ?? "");
  useEffect(() => {
    setProvider(config?.provider);
    setModel(config?.model ?? "");
  }, [config]);

  const handleMetabaseConnect = useCallback(async () => {
    await updateMetabotSettings({ provider: "metabase", model: "" });
  }, [updateMetabotSettings]);

  const metabotSettingsQuery = useGetMetabotSettingsQuery(
    provider && provider !== "metabase" ? { provider } : skipToken,
  );

  const isConfigured = useSetting("llm-metabot-configured?");
  const { details: providerApiKeyDetails } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
  ] as const);

  const providerOptions = useMemo(() => {
    const options = Object.values(getProviderOptions(offerMetabaseAiManaged));
    return options.map((o) => ({
      ...o,
      disabled: !isAvailableProvider(o.value),
    }));
  }, [offerMetabaseAiManaged]);

  const modelOptions = useMemo(
    () => getLlmModelOptions(metabotSettingsQuery.currentData?.models ?? []),
    [metabotSettingsQuery.currentData?.models],
  );

  const apiKeyError = metabotSettingsQuery.data?.["api-key-error"] ?? undefined;
  const modelError = getModelError(metabotSettingsQuery.error, provider);
  const saveError = updateMetabotSettingsResult.error
    ? getErrorMessage(
        updateMetabotSettingsResult,
        t`Unable to save provider settings.`,
      )
    : undefined;

  const handleProviderChange = (value: string) => {
    if (isMetabotProvider(value)) {
      setProvider(value);
      const configModel =
        value === config?.provider ? (config.model ?? "") : "";
      setModel(configModel);
    }
  };

  const handleModelChange = async (value: string) => {
    setModel(value);
    if (provider && value) {
      await updateMetabotSettings({ provider, model: value });
    }
  };

  const isConnected = Boolean(
    !updateMetabotSettingsResult.isLoading &&
      config?.provider &&
      config?.model &&
      isConfigured,
  );
  const isMetabaseProviderConnected = Boolean(
    isConnected && provider === "metabase" && config?.provider === "metabase",
  );

  const selectedApiKeySetting =
    provider && isApiKeyMetabotProvider(provider)
      ? providerApiKeyDetails[API_KEY_SETTING_BY_PROVIDER[provider]]
      : undefined;

  const needsApiKey =
    !!provider &&
    !!selectedApiKeySetting &&
    (!hasConfiguredSettingValue(selectedApiKeySetting) || !!apiKeyError);
  const showModelSelector =
    !needsApiKey && !isMetabaseProviderConnected && provider !== "metabase";

  return (
    <SettingsSection
      title={
        <Flex justify="space-between" align="center">
          <div>{t`Connect to an AI provider`}</div>
          {isConnected ? (
            <Badge bg="success" variant="filled" size="sm">
              {t`Connected`}
            </Badge>
          ) : (
            <Badge
              bg="background-tertiary"
              c="text-tertiary"
              variant="filled"
              size="sm"
            >
              {t`Not connected`}
            </Badge>
          )}
        </Flex>
      }
      description={t`Select your AI provider to get started with Metabot.`}
    >
      <Stack gap="md">
        <Select
          label={t`Provider`}
          placeholder={t`Select a provider`}
          description={t`Choose your preferred AI provider.`}
          data={providerOptions}
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
              <Text lh="1rem" c={option.disabled ? "text-tertiary" : undefined}>
                {option.label}
              </Text>
              {!isAvailableProvider(option.value as MetabotProvider) && (
                <Text c="text-tertiary" lh="1rem" size="sm">
                  {t`Coming soon`}
                </Text>
              )}
            </Group>
          )}
        />

        {provider === "metabase" && (
          <MetabaseAIProviderSetup
            isMetabaseProviderConnected={isMetabaseProviderConnected}
            isSavingMetabaseConnection={updateMetabotSettingsResult.isLoading}
            onConnect={handleMetabaseConnect}
          />
        )}

        {provider && isApiKeyMetabotProvider(provider) && (
          <MetabotProviderApiKey provider={provider} error={apiKeyError} />
        )}

        {showModelSelector && (
          <Select
            label={t`Model`}
            placeholder={
              provider
                ? metabotSettingsQuery.isFetching
                  ? t`Loading models...`
                  : t`Select a model`
                : t`Select a provider first`
            }
            description={getModelDescription(provider)}
            error={modelError}
            data={modelOptions}
            value={model}
            onChange={handleModelChange}
            disabled={isEnvSetting || needsApiKey}
            searchable
            nothingFoundMessage={t`No models found`}
          />
        )}

        {envSettingName && <SetByEnvVar varName={envSettingName} />}

        {updateMetabotSettingsResult.isLoading && (
          <Text size="sm" c="text-secondary">
            {t`Saving provider settings...`}
          </Text>
        )}

        {saveError && (
          <Text size="sm" c="error">
            {saveError}
          </Text>
        )}
      </Stack>
    </SettingsSection>
  );
}

const getLlmModelOptions = (models: MetabotSettingsResponse["models"]) => {
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: m.display_name,
    group: m.group,
  }));

  const sel = (o: MetabotModelOption) => _.pick(o, ["value", "label"]);
  // group model options if needed
  return _.every(modelOptions, (o) => !o.group)
    ? modelOptions.map(sel)
    : _.map(
        _.groupBy(modelOptions, (o) => o.group ?? t`Other`),
        (items, group) => ({ group, items: items.map(sel) }),
      );
};

const hasConfiguredSettingValue = (setting: SettingDefinition | undefined) =>
  Boolean(setting?.value || setting?.is_env_setting);

const getModelError = (error: unknown, provider?: MetabotProvider) =>
  !provider || !error
    ? undefined
    : getErrorMessage(error, t`Unable to load models.`);
