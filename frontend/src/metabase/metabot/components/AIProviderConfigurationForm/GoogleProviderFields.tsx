import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import {
  FormErrorMessage,
  FormFileInput,
  FormProvider,
  FormTextInput,
} from "metabase/forms";
import { useAdminSettings } from "metabase/settings";
import { Alert, Box, Code, Icon, SegmentedControl, Text } from "metabase/ui";
import type {
  GoogleCredentials,
  SettingDefinitionMap,
} from "metabase-types/api";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import { hasConfiguredSettingValue } from "./utils";

const GOOGLE_SETTING_KEYS = [
  "llm-google-service-account-key",
  "llm-google-oauth-access-token",
  "llm-google-project-id",
  "llm-google-location",
] as const;

const GOOGLE_MODEL_LOCATIONS_URL =
  "https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations#google-models";

// The models Metabot is known to work well with. Which of them a project can actually reach depends
// on its location, thus the input still accepts any model ID and only warns about the rest.
// The first entry in this list is used as the placeholder for the model form input below.
const RECOMMENDED_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash"] as const;

type GoogleSettingDetails = SettingDefinitionMap<
  (typeof GOOGLE_SETTING_KEYS)[number]
>;

type GoogleCredentialValues = {
  serviceAccountFile: File | null;
  oauthToken: string;
  projectId: string;
  location: string;
  model: string;
};

type GoogleAuthType = "service-account" | "oauth-token";

const isGoogleAuthType = (value: string): value is GoogleAuthType =>
  value === "service-account" || value === "oauth-token";

// The setting keeps publisher-qualified model IDs, e.g. `google/gemini-3.5-flash`. The input shows
// and accepts the bare Gemini ID. Thus we remove the default `google` publisher for the display and
// add it again on submit.
const stripGooglePublisher = (model: string | undefined) =>
  model?.replace(/^google\//, "") ?? "";

const qualifyGoogleModel = (model: string) =>
  model.includes("/") ? model : `google/${model}`;

const isRecommendedModel = (model: string) =>
  RECOMMENDED_MODELS.some(
    (recommended) =>
      recommended === stripGooglePublisher(model.trim().toLowerCase()),
  );

// Advisory only — a model outside the list still connects, it just may not work well with Metabot.
const getModelWarning = (model: string): string | null => {
  if (!model.trim() || isRecommendedModel(model)) {
    return null;
  }
  const recommendedModels = RECOMMENDED_MODELS.join(", ");
  return t`Metabot works best with these models: ${recommendedModels}. Other models may not work as expected.`;
};

const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t`Could not read the file`));
    reader.readAsText(file);
  });

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
      // The saved key JSON never goes back into the form. The file picker starts empty, and an
      // empty picker means "keep the saved key". See the placeholder of the picker.
      serviceAccountFile: null,
      oauthToken: String(details["llm-google-oauth-access-token"]?.value ?? ""),
      projectId: String(details["llm-google-project-id"]?.value ?? ""),
      location: String(details["llm-google-location"]?.value ?? ""),
      model: stripGooglePublisher(
        isCurrentConfigured ? connectedModel : undefined,
      ),
    }),
    [connectedModel, details, isCurrentConfigured],
  );

  const handleSubmit = async (
    values: GoogleCredentialValues,
    { resetForm }: FormikHelpers<GoogleCredentialValues>,
  ) => {
    // Send only the fields that changed. The backend keeps the saved value for a field that is
    // absent. A field that the user made blank goes as null, which clears the saved value.
    const credentials: GoogleCredentials = {};
    const setIfChanged = (
      apiField: keyof GoogleCredentials,
      field: "oauthToken" | "projectId" | "location",
    ) => {
      if (values[field] !== initialValues[field]) {
        credentials[apiField] = values[field] || null;
      }
    };

    setIfChanged("oauth-access-token", "oauthToken");
    setIfChanged("project-id", "projectId");
    setIfChanged("location", "location");

    if (values.serviceAccountFile) {
      credentials["service-account-key"] = await readFileText(
        values.serviceAccountFile,
      );
    }

    // A connection with one credential type clears the other. An env-backed credential is left alone: the env var
    // supplies it on every read, so clearing it would do nothing.
    const clearOtherCredential = (
      apiField: "service-account-key" | "oauth-access-token",
      settingKey:
        | "llm-google-service-account-key"
        | "llm-google-oauth-access-token",
    ) => {
      const setting = details[settingKey];
      const isClearable =
        hasConfiguredSettingValue(setting) && !setting?.is_env_setting;
      if (isClearable && !(apiField in credentials)) {
        credentials[apiField] = null;
      }
    };

    if (credentials["service-account-key"]) {
      clearOtherCredential(
        "oauth-access-token",
        "llm-google-oauth-access-token",
      );
    } else if (credentials["oauth-access-token"]) {
      clearOtherCredential(
        "service-account-key",
        "llm-google-service-account-key",
      );
    }

    await updateMetabotSettings({
      provider: "google",
      model: qualifyGoogleModel(values.model.trim()),
      credentials,
    }).unwrap();

    // Remove the key material after the save. The picker shows its placeholder again.
    resetForm({ values: { ...values, serviceAccountFile: null } });
  };

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <GoogleCredentialFields
        details={details}
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
      />
    </FormProvider>
  );
};

const GoogleCredentialFields = ({
  details,
  isCurrentConfigured,
  isEnvSetting,
}: {
  details: GoogleSettingDetails;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const { dirty, submitForm, values, setFieldValue, initialValues } =
    useFormikContext<GoogleCredentialValues>();

  const serviceAccountSetting = details["llm-google-service-account-key"];
  const oauthTokenSetting = details["llm-google-oauth-access-token"];
  const projectIdSetting = details["llm-google-project-id"];
  const locationSetting = details["llm-google-location"];

  const hasSavedServiceAccount = hasConfiguredSettingValue(
    serviceAccountSetting,
  );

  // Ensure auth toggle selects correct option based on current settings.
  const [authTypeOverride, setAuthTypeOverride] =
    useState<GoogleAuthType | null>(null);
  const savedAuthType: GoogleAuthType =
    !hasSavedServiceAccount && hasConfiguredSettingValue(oauthTokenSetting)
      ? "oauth-token"
      : "service-account";
  const authType = authTypeOverride ?? savedAuthType;

  const hasCompleteCredential =
    authType === "service-account"
      ? !!values.serviceAccountFile || hasSavedServiceAccount
      : !!values.oauthToken.trim() && !!values.projectId.trim();
  // The file picker never shows a saved key, thus an empty picker is still complete if a key is saved.
  const isComplete = hasCompleteCredential && !!values.model.trim();
  const modelWarning = getModelWarning(values.model);
  const connectHandler =
    isComplete && (!isCurrentConfigured || dirty) ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const handleAuthTypeChange = (value: string) => {
    if (!isGoogleAuthType(value)) {
      return;
    }
    setAuthTypeOverride(value);
    // Only the credential that is visible can go in the request. Reset what the admin entered for
    // the other auth type.
    if (value === "service-account") {
      setFieldValue("oauthToken", initialValues.oauthToken);
    } else {
      setFieldValue("serviceAccountFile", null);
    }
  };

  const serviceAccountEnvName = serviceAccountSetting?.is_env_setting
    ? serviceAccountSetting.env_name
    : undefined;
  const oauthTokenEnvName = oauthTokenSetting?.is_env_setting
    ? oauthTokenSetting.env_name
    : undefined;
  const projectIdEnvName = projectIdSetting?.is_env_setting
    ? projectIdSetting.env_name
    : undefined;
  const locationEnvName = locationSetting?.is_env_setting
    ? locationSetting.env_name
    : undefined;

  return (
    <>
      <FormTextInput
        name="projectId"
        label={t`Project ID`}
        description={t`The Google Cloud project to use. Optional if the service account key provides it.`}
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

      <FormTextInput
        name="model"
        label={t`Model`}
        description={jt`Model availability varies by location. ${(
          <ExternalLink key="model-locations" href={GOOGLE_MODEL_LOCATIONS_URL}>
            {t`See which Gemini models are available in each location.`}
          </ExternalLink>
        )}`}
        placeholder={RECOMMENDED_MODELS[0]}
        disabled={isMutating || isEnvSetting}
        w="100%"
      />
      {modelWarning && (
        <Alert size="compact" color="warning" icon={<Icon name="warning" />}>
          {modelWarning}
        </Alert>
      )}

      <Box>
        <Text fw="bold">{t`Authentication method`}</Text>
        <Text size="sm" c="text-secondary">
          {t`Authenticate with a service account key or an OAuth access token.`}
        </Text>
      </Box>

      <SegmentedControl
        value={authType}
        onChange={handleAuthTypeChange}
        disabled={isMutating || isEnvSetting}
        data={[
          { value: "service-account", label: t`Service account key` },
          { value: "oauth-token", label: t`OAuth token` },
        ]}
        aria-label={t`Authentication method`}
        fullWidth
      />

      {authType === "service-account" && (
        <>
          <FormFileInput
            name="serviceAccountFile"
            label={t`Service account key file`}
            description={
              hasSavedServiceAccount ? (
                <>
                  <strong>{t`A service account key is saved.`}</strong>{" "}
                  {t`Choose a new file to replace it.`}
                </>
              ) : (
                t`Upload a service account key file to authenticate with.`
              )
            }
            placeholder={t`Click to select a file`}
            leftSection={<Icon name="upload" />}
            accept="application/json"
            clearable
            clearButtonProps={{ "aria-label": t`Clear the selected file` }}
            disabled={isMutating || isEnvSetting || !!serviceAccountEnvName}
            fileInputProps={{ "aria-label": t`Service account key file input` }}
            w="100%"
          />
          {serviceAccountEnvName && (
            <SetByEnvVar varName={serviceAccountEnvName} />
          )}
        </>
      )}

      {authType === "oauth-token" && (
        <>
          <FormTextInput
            name="oauthToken"
            label={t`OAuth token`}
            type="password"
            description={jt`Paste a short-lived OAuth access token, e.g. the output of ${(
              <Code key="gcloud">{"gcloud auth print-access-token"}</Code>
            )}. Useful for testing.`}
            placeholder="ya29..."
            disabled={isMutating || isEnvSetting || !!oauthTokenEnvName}
            w="100%"
          />
          {oauthTokenEnvName && <SetByEnvVar varName={oauthTokenEnvName} />}
        </>
      )}

      <FormErrorMessage />
    </>
  );
};
