import { type FocusEvent, useMemo, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useListModelsQuery } from "metabase/api/llm";
import { useAdminSetting } from "metabase/api/utils/settings";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, PasswordInput, Select, Stack, TextInput } from "metabase/ui";

export function MetabotSQLGenerationSettingsSection() {
  const apiKey = useAdminSetting("llm-anthropic-api-key");
  const model = useAdminSetting("llm-anthropic-model");
  const { updateSetting, settingDetails: apiKeyDetails } = apiKey;
  const { settingDetails: modelDetails } = model;

  const [localApiKey, setLocalApiKey] = useState<string | null>(null);

  const isApiKeyEnvVar = !!(
    apiKeyDetails?.is_env_setting && apiKeyDetails?.env_name
  );
  const isModelEnvVar = !!(
    modelDetails?.is_env_setting && modelDetails?.env_name
  );
  const ApiKeyInput = isApiKeyEnvVar ? TextInput : PasswordInput;

  const savedApiKey = apiKey.value ?? "";
  const hasApiKey = savedApiKey.trim().length > 0;
  const apiKeyDisplayValue = localApiKey ?? savedApiKey;

  const {
    data: modelsData,
    isLoading: isModelsLoading,
    error: modelsError,
  } = useListModelsQuery(undefined, { skip: !hasApiKey });

  const modelOptions = useMemo(() => {
    return (modelsData?.models || []).map((m) => ({
      value: m.id,
      label: m.display_name,
    }));
  }, [modelsData]);

  const isSettingsLoading = apiKey.isLoading || model.isLoading;
  const settingsError = apiKey.error || model.error;

  if (isSettingsLoading || settingsError) {
    return (
      <LoadingAndErrorWrapper
        loading={isSettingsLoading}
        error={settingsError}
      />
    );
  }

  const modelValue = model.value ?? "";
  const isModelFieldDisabled = !hasApiKey || isModelsLoading || !!modelsError;
  const isDeprecatedModel =
    modelOptions.length > 0 &&
    !modelOptions.some((opt) => opt.value === modelValue);

  const handleApiKeyBlur = async (e: FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value !== savedApiKey) {
      await updateSetting({ key: "llm-anthropic-api-key", value });
    }
    setLocalApiKey(null);
  };

  const handleModelChange = (value: string | null) => {
    if (value && value !== model.value) {
      updateSetting({ key: "llm-anthropic-model", value });
    }
  };

  return (
    <SettingsPageWrapper>
      <SettingsSection
        title={t`SQL Generation`}
        description={t`Ask questions in plain language and get results — Metabot handles the SQL.`}
      >
        <Stack gap="md">
          <Box>
            <ApiKeyInput
              disabled={isApiKeyEnvVar}
              label={t`Anthropic API Key`}
              description={t`Your API key. This key is encrypted and stored securely.`}
              placeholder={t`Enter your API key`}
              value={apiKeyDisplayValue}
              onChange={(e) => setLocalApiKey(e.target.value)}
              onBlur={handleApiKeyBlur}
              type="password"
            />
            {isApiKeyEnvVar && (
              <SetByEnvVar varName={apiKeyDetails.env_name!} />
            )}
          </Box>

          <Box>
            <Select
              disabled={isModelFieldDisabled || !!isModelEnvVar}
              label={t`Anthropic Model`}
              description={t`The model to use for SQL generation.`}
              placeholder={isModelsLoading ? t`Loading models...` : undefined}
              data={modelOptions}
              value={isDeprecatedModel ? null : modelValue}
              onChange={handleModelChange}
              error={
                modelsError
                  ? t`Failed to load models`
                  : isDeprecatedModel
                    ? t`The model "${modelValue}" is no longer available. Please select a new model.`
                    : undefined
              }
            />
            {isModelEnvVar && <SetByEnvVar varName={modelDetails.env_name!} />}
          </Box>
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
