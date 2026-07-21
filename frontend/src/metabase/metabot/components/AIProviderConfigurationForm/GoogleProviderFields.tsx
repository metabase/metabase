import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { useAdminSettings } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { FormErrorMessage, FormProvider, FormTextInput } from "metabase/forms";
import { Text } from "metabase/ui";
import type { GoogleCredentials } from "metabase-types/api";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import {
  ProviderModelPicker,
  useProviderModelsQuery,
} from "./ProviderModelPicker";
import { getProviderOptions, hasConfiguredSettingValue } from "./utils";

const GOOGLE_SETTING_KEYS = [
  "llm-google-api-key",
  "llm-google-project-id",
  "llm-google-location",
] as const;

type GoogleCredentialValues = {
  apiKey: string;
  projectId: string;
  location: string;
};

export const GoogleProviderFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [updateMetabotSettings] = useUpdateMetabotSettingsMutation();
  const { details } = useAdminSettings(GOOGLE_SETTING_KEYS);

  const initialValues = useMemo<GoogleCredentialValues>(
    () => ({
      apiKey: String(details["llm-google-api-key"]?.value ?? ""),
      projectId: String(details["llm-google-project-id"]?.value ?? ""),
      location: String(details["llm-google-location"]?.value ?? ""),
    }),
    [details],
  );

  const handleSubmit = async (
    values: GoogleCredentialValues,
    { resetForm }: FormikHelpers<GoogleCredentialValues>,
  ) => {
    // Per-field presence contract: an unchanged field is omitted so the backend keeps the saved
    // value, while a field the user blanked is sent as an explicit null to clear the saved value.
    const credentials: GoogleCredentials = {};
    const setIfChanged = (
      apiField: keyof GoogleCredentials,
      field: keyof GoogleCredentialValues,
    ) => {
      if (values[field] !== initialValues[field]) {
        credentials[apiField] = values[field] || null;
      }
    };

    setIfChanged("api-key", "apiKey");
    setIfChanged("project-id", "projectId");
    setIfChanged("location", "location");

    await updateMetabotSettings({
      provider: "google",
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
      <GoogleCredentialFields
        connectedModel={connectedModel}
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
      />
    </FormProvider>
  );
};

const GoogleCredentialFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const { dirty, submitForm, values } =
    useFormikContext<GoogleCredentialValues>();

  const isComplete = !!values.apiKey.trim() && !!values.projectId.trim();
  const connectHandler =
    isComplete && (!isCurrentConfigured || dirty) ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const { details } = useAdminSettings(GOOGLE_SETTING_KEYS);
  const apiKeySetting = details["llm-google-api-key"];
  const projectIdSetting = details["llm-google-project-id"];
  const locationSetting = details["llm-google-location"];

  const apiKeyEnvName = apiKeySetting?.is_env_setting
    ? apiKeySetting.env_name
    : undefined;
  const projectIdEnvName = projectIdSetting?.is_env_setting
    ? projectIdSetting.env_name
    : undefined;
  const locationEnvName = locationSetting?.is_env_setting
    ? locationSetting.env_name
    : undefined;

  const needsCredentials =
    !hasConfiguredSettingValue(apiKeySetting) ||
    !hasConfiguredSettingValue(projectIdSetting);

  const { modelsQuery, credentialsError: savedCredentialsError } =
    useProviderModelsQuery("google", { skip: needsCredentials });
  const credentialsError = dirty ? undefined : savedCredentialsError;

  const googleOption = getProviderOptions(true).google;

  return (
    <>
      <FormTextInput
        name="apiKey"
        label={t`API key`}
        type="password"
        description={
          <>
            <ExternalLink href={googleOption.apiKey.addKeyUrl}>
              {t`Get or manage API keys in the Google Cloud console`}
            </ExternalLink>{" "}
            {t`You can also paste a short-lived OAuth access token.`}
          </>
        }
        placeholder={googleOption.apiKey.placeholder}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvName}
        w="100%"
      />
      {apiKeyEnvName && <SetByEnvVar varName={apiKeyEnvName} />}
      {credentialsError && (
        <Text size="sm" c="feedback-negative" role="alert">
          {credentialsError}
        </Text>
      )}

      <FormTextInput
        name="projectId"
        label={t`Project ID`}
        description={t`The Google Cloud project to use.`}
        placeholder={t`Enter your Google Cloud project ID`}
        disabled={isMutating || isEnvSetting || !!projectIdEnvName}
        w="100%"
      />
      {projectIdEnvName && <SetByEnvVar varName={projectIdEnvName} />}

      <FormTextInput
        name="location"
        label={t`Location`}
        description={t`Optional. Defaults to global.`}
        placeholder="global"
        disabled={isMutating || isEnvSetting || !!locationEnvName}
        w="100%"
      />
      {locationEnvName && <SetByEnvVar varName={locationEnvName} />}

      {!needsCredentials && !credentialsError && (
        <ProviderModelPicker
          provider="google"
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
