import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { FormErrorMessage, FormProvider, FormTextInput } from "metabase/forms";
import { useAdminSettings } from "metabase/settings";
import { Text } from "metabase/ui";
import type {
  MetabotSettingsResponse,
  VllmCredentials,
} from "metabase-types/api";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import {
  ProviderModelPicker,
  useProviderModelsQuery,
} from "./ProviderModelPicker";
import { hasConfiguredSettingValue } from "./utils";

const VLLM_SETTING_KEYS = [
  "llm-vllm-api-base-url",
  "llm-vllm-api-key",
] as const;

type VllmCredentialValues = {
  baseUrl: string;
  apiKey: string;
};

/** Follows `BedrockProviderFields`; `ApiKeyProviderFields` gates the model picker on an API key,
 * which a vLLM server may legitimately not have. */
export const VllmProviderFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();
  const { details } = useAdminSettings(VLLM_SETTING_KEYS);

  const initialValues = useMemo<VllmCredentialValues>(
    () => ({
      baseUrl: String(details["llm-vllm-api-base-url"]?.value ?? ""),
      apiKey: String(details["llm-vllm-api-key"]?.value ?? ""),
    }),
    [details],
  );

  const handleSubmit = async (
    values: VllmCredentialValues,
    { resetForm }: FormikHelpers<VllmCredentialValues>,
  ) => {
    // Unchanged fields are omitted so the backend keeps them; a blanked field sends null to clear.
    const credentials: VllmCredentials = {};
    if (values.baseUrl !== initialValues.baseUrl) {
      credentials["base-url"] = values.baseUrl || null;
    }
    if (values.apiKey !== initialValues.apiKey) {
      credentials["api-key"] = values.apiKey || null;
    }

    await updateMetabotSettings({
      provider: "vllm",
      credentials,
    }).unwrap();

    resetForm({ values });
  };

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <VllmCredentialFields
        connectedModel={connectedModel}
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
        hasVerifiedCredentials={updateMetabotSettingsResult.isSuccess}
        verifiedModels={updateMetabotSettingsResult.data?.models ?? []}
      />
    </FormProvider>
  );
};

const VllmCredentialFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
  hasVerifiedCredentials,
  verifiedModels,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
  hasVerifiedCredentials: boolean;
  verifiedModels: MetabotSettingsResponse["models"];
}) => {
  const { dirty, submitForm, values } =
    useFormikContext<VllmCredentialValues>();

  const isComplete = !!values.baseUrl.trim();
  const connectHandler =
    isComplete && (!isCurrentConfigured || dirty) ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const { details } = useAdminSettings(VLLM_SETTING_KEYS);
  const baseUrlSetting = details["llm-vllm-api-base-url"];
  const apiKeySetting = details["llm-vllm-api-key"];

  const baseUrlEnvName = baseUrlSetting?.is_env_setting
    ? baseUrlSetting.env_name
    : undefined;
  const apiKeyEnvName = apiKeySetting?.is_env_setting
    ? apiKeySetting.env_name
    : undefined;

  // `hasVerifiedCredentials` shows the picker right after a connect, without waiting for a refetch.
  const needsCredentials =
    !hasConfiguredSettingValue(baseUrlSetting) && !hasVerifiedCredentials;

  const { modelsQuery, credentialsError: savedCredentialsError } =
    useProviderModelsQuery("vllm", { skip: needsCredentials });
  const credentialsError = dirty ? undefined : savedCredentialsError;

  const queriedModels = modelsQuery.currentData?.models ?? [];
  const models = queriedModels.length > 0 ? queriedModels : verifiedModels;

  return (
    <>
      <FormTextInput
        name="baseUrl"
        label={t`Base URL`}
        description={t`The OpenAI-compatible API of your vLLM server, including the version segment.`}
        placeholder="http://vllm.internal:8000/v1"
        disabled={isMutating || isEnvSetting || !!baseUrlEnvName}
        w="100%"
      />
      {baseUrlEnvName && <SetByEnvVar varName={baseUrlEnvName} />}
      {credentialsError && (
        <Text size="sm" c="feedback-negative" role="alert">
          {credentialsError}
        </Text>
      )}

      <FormTextInput
        name="apiKey"
        label={t`API key`}
        type="password"
        description={t`Optional. Only needed if you started your server with --api-key.`}
        placeholder={t`Enter your vLLM API key`}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvName}
        w="100%"
      />
      {apiKeyEnvName && <SetByEnvVar varName={apiKeyEnvName} />}

      {!needsCredentials && !credentialsError && (
        <ProviderModelPicker
          provider="vllm"
          connectedModel={connectedModel}
          models={models}
          isLoading={modelsQuery.isLoading && models.length === 0}
          loadError={modelsQuery.error}
          disabled={isEnvSetting || isMutating}
        />
      )}

      <FormErrorMessage />
    </>
  );
};
