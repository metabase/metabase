import { type FocusEvent, useState } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils/settings";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Code, Stack, TextInput } from "metabase/ui";

export function MetabotSQLGenerationSettingsSection() {
  const apiKey = useAdminSetting("llm-anthropic-api-key");
  const model = useAdminSetting("llm-anthropic-model");
  const { updateSetting } = apiKey;

  const isLoading = apiKey.isLoading || model.isLoading;
  const error = apiKey.error || model.error;

  const [localApiKey, setLocalApiKey] = useState<string | null>(null);
  const [localModel, setLocalModel] = useState<string | null>(null);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const apiKeyValue = localApiKey ?? apiKey.value ?? "";
  const modelValue = localModel ?? model.value ?? "";

  const handleApiKeyBlur = (e: FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value !== apiKey.value) {
      updateSetting({ key: "llm-anthropic-api-key", value });
    }
    setLocalApiKey(null);
  };

  const handleModelBlur = (e: FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value !== model.value) {
      updateSetting({ key: "llm-anthropic-model", value });
    }
    setLocalModel(null);
  };

  // eslint-disable-next-line i18next/no-literal-string -- literal value used by our api
  const defaultModelAlias = <Code key="alias">claude-sonnet-4-5</Code>;
  // eslint-disable-next-line i18next/no-literal-string -- literal value used by our api
  const defaultModelId = <Code key="id">claude-sonnet-4-5-20250929</Code>;

  return (
    <SettingsPageWrapper>
      <SettingsSection
        title={t`SQL Generation`}
        description={t`Ask questions in plain language and get results — Metabot handles the SQL.`}
      >
        <Stack gap="md">
          <TextInput
            label={t`Anthropic API Key`}
            description={t`Your API key. This key is encrypted and stored securely.`}
            placeholder={t`Enter your API key`}
            value={apiKeyValue}
            onChange={(e) => setLocalApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
          />

          <TextInput
            disabled={apiKeyValue.trim().length === 0}
            label={t`Anthropic Model`}
            description={jt`The model to use for SQL generation. Enter a model alias like ${defaultModelAlias} to use the latest version, or a specific ID like ${defaultModelId} to pin to an exact version.`}
            placeholder="claude-sonnet-4-5"
            value={modelValue}
            onChange={(e) => setLocalModel(e.target.value)}
            onBlur={handleModelBlur}
          />
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
