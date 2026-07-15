import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo } from "react";
import { c, t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { useAdminSettings } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import {
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormTextInput,
} from "metabase/forms";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import {
  AZURE_MODEL_FAMILIES,
  getProviderOptions,
  parseAzureModel,
} from "./utils";

const AZURE_SETTING_KEYS = [
  "llm-azure-api-key",
  "llm-azure-api-base-url",
] as const;

type AzureCredentialValues = {
  family: string;
  apiKey: string;
  baseUrl: string;
  deployment: string;
};

export const AzureProviderFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [updateMetabotSettings] = useUpdateMetabotSettingsMutation();
  const { details } = useAdminSettings(AZURE_SETTING_KEYS);

  const initialValues = useMemo<AzureCredentialValues>(() => {
    const { family, deployment } = parseAzureModel(
      isCurrentConfigured ? connectedModel : undefined,
    );

    return {
      family: family ?? "",
      apiKey: String(details["llm-azure-api-key"]?.value ?? ""),
      baseUrl: String(details["llm-azure-api-base-url"]?.value ?? ""),
      deployment: deployment ?? "",
    };
  }, [connectedModel, details, isCurrentConfigured]);

  const handleSubmit = async (
    values: AzureCredentialValues,
    { resetForm }: FormikHelpers<AzureCredentialValues>,
  ) => {
    const changedValueOrNull = (field: "apiKey" | "baseUrl") =>
      values[field] !== initialValues[field] ? values[field] || null : null;

    await updateMetabotSettings({
      provider: "azure",
      model: `${values.family}/${values.deployment}`,
      credentials: {
        "api-key": changedValueOrNull("apiKey"),
        "base-url": changedValueOrNull("baseUrl"),
      },
    }).unwrap();

    resetForm({ values });
  };

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <AzureCredentialFields
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
      />
    </FormProvider>
  );
};

const AzureCredentialFields = ({
  isCurrentConfigured,
  isEnvSetting,
}: {
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const { dirty, submitForm, values } =
    useFormikContext<AzureCredentialValues>();

  const { details } = useAdminSettings(AZURE_SETTING_KEYS);
  const apiKeySetting = details["llm-azure-api-key"];
  const baseUrlSetting = details["llm-azure-api-base-url"];

  const apiKeyEnvName = apiKeySetting?.is_env_setting
    ? apiKeySetting.env_name
    : undefined;
  const baseUrlEnvName = baseUrlSetting?.is_env_setting
    ? baseUrlSetting.env_name
    : undefined;

  const isComplete =
    !!values.family &&
    !!values.apiKey.trim() &&
    !!values.baseUrl.trim() &&
    !!values.deployment.trim();
  const connectHandler =
    isComplete && (!isCurrentConfigured || dirty) ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const providerDetails = getProviderOptions(true).azure;

  return (
    <>
      <FormSelect
        name="family"
        label={t`Model provider`}
        description={t`Whether your deployment serves an Anthropic or an OpenAI model.`}
        placeholder={t`Select a model provider`}
        data={[...AZURE_MODEL_FAMILIES]}
        disabled={isMutating || isEnvSetting}
      />

      <FormTextInput
        name="baseUrl"
        label={t`Base URL`}
        description={t`The full URL of your Azure resource's model-provider surface, including the provider segment.`}
        placeholder="https://<resource>.services.ai.azure.com/openai"
        disabled={isMutating || isEnvSetting || !!baseUrlEnvName}
        w="100%"
      />
      {baseUrlEnvName && <SetByEnvVar varName={baseUrlEnvName} />}

      <FormTextInput
        name="apiKey"
        label={t`API key`}
        type="password"
        description={
          <ExternalLink href={providerDetails.apiKey.addKeyUrl}>
            {c("{0} is the name of an AI provider")
              .t`Get or manage keys in ${providerDetails.label}`}
          </ExternalLink>
        }
        placeholder={providerDetails.apiKey.placeholder}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvName}
        w="100%"
      />
      {apiKeyEnvName && <SetByEnvVar varName={apiKeyEnvName} />}

      <FormTextInput
        name="deployment"
        label={t`Deployment name`}
        description={t`The name of the model deployment on your Azure resource. We recommend naming deployments after the model they serve.`}
        placeholder={t`Enter your Azure deployment name`}
        disabled={isMutating || isEnvSetting}
        w="100%"
      />

      <FormErrorMessage />
    </>
  );
};
