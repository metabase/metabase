import { type ChangeEvent, useEffect, useState } from "react";
import { c, t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { getErrorMessage, useAdminSettings } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { Text, TextInput } from "metabase/ui";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import {
  ProviderModelPicker,
  useProviderModelsQuery,
} from "./ProviderModelPicker";
import {
  API_KEY_SETTING_BY_PROVIDER,
  type MetabotApiKeyProvider,
  getProviderOptions,
  hasConfiguredSettingValue,
} from "./utils";

export const ApiKeyProviderFields = ({
  selectedProvider,
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  selectedProvider: MetabotApiKeyProvider;
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [localApiKey, setLocalApiKey] = useState<string | null>(null);
  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const { details } = useAdminSettings([
    "llm-anthropic-api-key",
    "llm-openai-api-key",
    "llm-openrouter-api-key",
  ] as const);
  const apiKeySetting = details[API_KEY_SETTING_BY_PROVIDER[selectedProvider]];
  const apiKeyEnvSettingName = apiKeySetting?.is_env_setting
    ? apiKeySetting.env_name
    : undefined;

  const onConnect = async () => {
    await updateMetabotSettings({
      provider: selectedProvider,
      ...(localApiKey !== null && { "api-key": localApiKey || null }),
    }).unwrap();
  };

  const hasDirtyApiKey = localApiKey !== null;
  const connectHandler =
    !isCurrentConfigured || hasDirtyApiKey ? onConnect : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const hasVerifiedApiKey = updateMetabotSettingsResult.isSuccess;
  const needsApiKey =
    !hasConfiguredSettingValue(apiKeySetting) && !hasVerifiedApiKey;
  const { modelsQuery, credentialsError: savedCredentialsError } =
    useProviderModelsQuery(selectedProvider, { skip: needsApiKey });
  const credentialsError = hasDirtyApiKey ? undefined : savedCredentialsError;

  const queriedModels = modelsQuery.currentData?.models ?? [];
  const verifiedModels = updateMetabotSettingsResult.data?.models ?? [];
  const models = queriedModels.length > 0 ? queriedModels : verifiedModels;

  const apiKeySettingValue = apiKeySetting?.value;

  // Reset the local (dirty) key when the saved key changes, e.g. after a save
  // or a provider switch. The parent gates these fields on details-loaded, so
  // the saved value is authoritative on mount and this can't fire on a
  // details-hydration flip and wipe a key the user has started typing.
  useEffect(() => {
    if (apiKeySettingValue) {
      setLocalApiKey(null);
    }
  }, [apiKeySettingValue]);

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLocalApiKey(event.target.value);
  };

  const providerDetails = getProviderOptions(true)[selectedProvider];

  return (
    <>
      <TextInput
        label={t`API key`}
        type="password"
        description={
          <ExternalLink href={providerDetails.apiKey.addKeyUrl}>
            {c("{0} is the name of an AI provider")
              .t`Get or manage keys in ${providerDetails.label}`}
          </ExternalLink>
        }
        placeholder={providerDetails.apiKey.placeholder}
        value={localApiKey ?? String(apiKeySettingValue ?? "")}
        error={credentialsError}
        onChange={handleApiKeyChange}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvSettingName}
        w="100%"
      />

      {apiKeyEnvSettingName ? (
        <SetByEnvVar varName={apiKeyEnvSettingName} />
      ) : null}

      {!needsApiKey && !credentialsError && (
        <ProviderModelPicker
          provider={selectedProvider}
          connectedModel={connectedModel}
          models={models}
          isLoading={modelsQuery.isLoading && models.length === 0}
          loadError={modelsQuery.error}
          disabled={isEnvSetting || isMutating}
        />
      )}

      {updateMetabotSettingsResult.error && (
        <Text size="sm" c="feedback-negative">
          {getErrorMessage(
            updateMetabotSettingsResult.error,
            t`Unable to save provider settings.`,
          )}
        </Text>
      )}
    </>
  );
};
