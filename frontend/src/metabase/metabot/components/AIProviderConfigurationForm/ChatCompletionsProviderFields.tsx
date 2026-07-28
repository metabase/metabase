import { type FormikHelpers, useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { useAdminSettings } from "metabase/api/utils";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { FormErrorMessage, FormProvider, FormTextInput } from "metabase/forms";

import { useAIProviderConfigurationContext } from "./AIProviderConfigurationContext";
import { getProviderOptions } from "./utils";

const CHAT_COMPLETIONS_SETTING_KEYS = [
  "llm-chat-completions-api-key",
  "llm-chat-completions-api-base-url",
] as const;

type ChatCompletionsValues = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const ChatCompletionsProviderFields = ({
  connectedModel,
  isCurrentConfigured,
  isEnvSetting,
}: {
  connectedModel: string | undefined;
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const [updateMetabotSettings] = useUpdateMetabotSettingsMutation();
  const { details } = useAdminSettings(CHAT_COMPLETIONS_SETTING_KEYS);

  const initialValues = useMemo<ChatCompletionsValues>(
    () => ({
      baseUrl: String(
        details["llm-chat-completions-api-base-url"]?.value ?? "",
      ),
      apiKey: String(details["llm-chat-completions-api-key"]?.value ?? ""),
      model: isCurrentConfigured ? (connectedModel ?? "") : "",
    }),
    [connectedModel, details, isCurrentConfigured],
  );

  const handleSubmit = async (
    values: ChatCompletionsValues,
    { resetForm }: FormikHelpers<ChatCompletionsValues>,
  ) => {
    const changedValueOrNull = (field: "apiKey" | "baseUrl") =>
      values[field] !== initialValues[field] ? values[field] || null : null;

    await updateMetabotSettings({
      provider: "chat-completions",
      model: values.model.trim(),
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
      <ChatCompletionsCredentialFields
        isCurrentConfigured={isCurrentConfigured}
        isEnvSetting={isEnvSetting}
      />
    </FormProvider>
  );
};

const ChatCompletionsCredentialFields = ({
  isCurrentConfigured,
  isEnvSetting,
}: {
  isCurrentConfigured: boolean;
  isEnvSetting: boolean;
}) => {
  const { dirty, submitForm, values } =
    useFormikContext<ChatCompletionsValues>();

  const { details } = useAdminSettings(CHAT_COMPLETIONS_SETTING_KEYS);
  const apiKeySetting = details["llm-chat-completions-api-key"];
  const baseUrlSetting = details["llm-chat-completions-api-base-url"];

  const apiKeyEnvName = apiKeySetting?.is_env_setting
    ? apiKeySetting.env_name
    : undefined;
  const baseUrlEnvName = baseUrlSetting?.is_env_setting
    ? baseUrlSetting.env_name
    : undefined;

  const isComplete =
    !!values.baseUrl.trim() && !!values.apiKey.trim() && !!values.model.trim();
  const connectHandler =
    isComplete && (!isCurrentConfigured || dirty) ? submitForm : null;
  const { isMutating } = useAIProviderConfigurationContext(connectHandler);

  const providerDetails = getProviderOptions(true)["chat-completions"];

  return (
    <>
      <FormTextInput
        name="baseUrl"
        label={t`Base URL`}
        description={t`The base URL of your OpenAI-compatible Chat Completions endpoint, including the version segment.`}
        placeholder="https://api.example.com/v1"
        disabled={isMutating || isEnvSetting || !!baseUrlEnvName}
        w="100%"
      />
      {baseUrlEnvName && <SetByEnvVar varName={baseUrlEnvName} />}

      <FormTextInput
        name="apiKey"
        label={t`API key`}
        type="password"
        placeholder={providerDetails.apiKey.placeholder}
        disabled={isMutating || isEnvSetting || !!apiKeyEnvName}
        w="100%"
      />
      {apiKeyEnvName && <SetByEnvVar varName={apiKeyEnvName} />}

      <FormTextInput
        name="model"
        label={t`Model name`}
        description={t`The model to send to your endpoint, e.g. the value it expects in the request's "model" field.`}
        placeholder={t`Enter your model name`}
        disabled={isMutating || isEnvSetting}
        w="100%"
      />

      <FormErrorMessage />
    </>
  );
};
