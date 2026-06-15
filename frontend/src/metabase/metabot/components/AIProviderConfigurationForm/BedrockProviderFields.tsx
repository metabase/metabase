import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { useAdminSettings } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { FormErrorMessage, FormProvider, FormTextInput } from "metabase/forms";
import { Text } from "metabase/ui";
import type { BedrockCredentials } from "metabase-types/api";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import {
  ProviderModelPicker,
  useProviderModelsQuery,
} from "./ProviderModelPicker";
import { getProviderOptions, hasConfiguredSettingValue } from "./utils";

const BEDROCK_SETTING_KEYS = [
  "llm-bedrock-access-key-id",
  "llm-bedrock-secret-access-key",
  "llm-bedrock-region",
  "llm-bedrock-session-token",
] as const;

type BedrockCredentialValues = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken: string;
};

export const BedrockProviderFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [updateMetabotSettings] = useUpdateMetabotSettingsMutation();
  const { details } = useAdminSettings(BEDROCK_SETTING_KEYS);

  const initialValues = useMemo<BedrockCredentialValues>(
    () => ({
      accessKeyId: String(details["llm-bedrock-access-key-id"]?.value ?? ""),
      secretAccessKey: String(
        details["llm-bedrock-secret-access-key"]?.value ?? "",
      ),
      region: String(details["llm-bedrock-region"]?.value ?? ""),
      sessionToken: String(details["llm-bedrock-session-token"]?.value ?? ""),
    }),
    [details],
  );

  const handleSubmit = async (
    values: BedrockCredentialValues,
    { resetForm }: FormikHelpers<BedrockCredentialValues>,
  ) => {
    // Per-field presence contract: an unchanged field is omitted so the backend keeps the saved
    // value, while a field the user blanked is sent as an explicit null to clear the saved value.
    const credentials: BedrockCredentials = {};
    const setIfChanged = (
      apiField: keyof BedrockCredentials,
      field: keyof BedrockCredentialValues,
    ) => {
      if (values[field] !== initialValues[field]) {
        credentials[apiField] = values[field] || null;
      }
    };

    setIfChanged("access-key-id", "accessKeyId");
    setIfChanged("secret-access-key", "secretAccessKey");
    setIfChanged("region", "region");
    setIfChanged("session-token", "sessionToken");

    await updateMetabotSettings({
      provider: "bedrock",
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
      <BedrockCredentialFields
        connectedModel={connectedModel}
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
      />
    </FormProvider>
  );
};

const BedrockCredentialFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const { dirty, submitForm } = useFormikContext<BedrockCredentialValues>();
  const connectHandler = !isCurrentConfigured || dirty ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const { details } = useAdminSettings(BEDROCK_SETTING_KEYS);
  const accessKeyIdSetting = details["llm-bedrock-access-key-id"];
  const secretAccessKeySetting = details["llm-bedrock-secret-access-key"];
  const regionSetting = details["llm-bedrock-region"];
  const sessionTokenSetting = details["llm-bedrock-session-token"];

  const accessKeyIdEnvName = accessKeyIdSetting?.is_env_setting
    ? accessKeyIdSetting.env_name
    : undefined;
  const secretAccessKeyEnvName = secretAccessKeySetting?.is_env_setting
    ? secretAccessKeySetting.env_name
    : undefined;
  const regionEnvName = regionSetting?.is_env_setting
    ? regionSetting.env_name
    : undefined;
  const sessionTokenEnvName = sessionTokenSetting?.is_env_setting
    ? sessionTokenSetting.env_name
    : undefined;

  const needsCredentials =
    !hasConfiguredSettingValue(accessKeyIdSetting) ||
    !hasConfiguredSettingValue(secretAccessKeySetting);

  const { modelsQuery, credentialsError: savedCredentialsError } =
    useProviderModelsQuery("bedrock", { skip: needsCredentials });
  const credentialsError = dirty ? undefined : savedCredentialsError;

  const bedrockOption = getProviderOptions(true).bedrock;

  return (
    <>
      <FormTextInput
        name="accessKeyId"
        label={t`Access key ID`}
        type="password"
        description={
          <ExternalLink href={bedrockOption.apiKey.addKeyUrl}>
            {t`Get or manage access keys in the AWS console`}
          </ExternalLink>
        }
        placeholder={bedrockOption.apiKey.placeholder}
        disabled={isMutating || isEnvSetting || !!accessKeyIdEnvName}
        w="100%"
      />
      {accessKeyIdEnvName && <SetByEnvVar varName={accessKeyIdEnvName} />}
      {credentialsError && (
        <Text size="sm" c="error" role="alert">
          {credentialsError}
        </Text>
      )}

      <FormTextInput
        name="secretAccessKey"
        label={t`Secret access key`}
        type="password"
        description={t`Paired with the access key ID. AWS shows it only when the key is created.`}
        placeholder={t`Enter your AWS secret access key`}
        disabled={isMutating || isEnvSetting || !!secretAccessKeyEnvName}
        w="100%"
      />
      {secretAccessKeyEnvName && (
        <SetByEnvVar varName={secretAccessKeyEnvName} />
      )}

      <FormTextInput
        name="region"
        label={t`Region`}
        description={t`The AWS region to use for Bedrock.`}
        placeholder="us-east-1"
        disabled={isMutating || isEnvSetting || !!regionEnvName}
        w="100%"
      />
      {regionEnvName && <SetByEnvVar varName={regionEnvName} />}

      <FormTextInput
        name="sessionToken"
        label={t`Session token`}
        type="password"
        description={t`Optional. Only needed for temporary AWS credentials.`}
        placeholder={t`Enter your AWS session token`}
        disabled={isMutating || isEnvSetting || !!sessionTokenEnvName}
        w="100%"
      />
      {sessionTokenEnvName && <SetByEnvVar varName={sessionTokenEnvName} />}

      {!needsCredentials && !credentialsError && (
        <ProviderModelPicker
          provider="bedrock"
          connectedModel={connectedModel}
          models={modelsQuery.currentData?.models ?? []}
          isLoading={modelsQuery.isLoading}
          loadError={modelsQuery.error}
          disabled={isEnvSetting || isMutating}
        />
      )}

      <FormErrorMessage />
    </>
  );
};
