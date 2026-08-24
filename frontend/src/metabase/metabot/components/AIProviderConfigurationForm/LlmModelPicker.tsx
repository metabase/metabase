import { jt, t } from "ttag";

import { skipToken, useGetLlmActiveModelQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useLlmConnectionModels } from "metabase/metabot/hooks";
import { useAdminSetting } from "metabase/settings";
import { DefaultSelectItem, Select, Stack, Text } from "metabase/ui";
import type { LlmActiveModel } from "metabase-types/api";

export type LlmModelSettingKey = "llm-metabot-provider" | "llm-mini-model";

const ACTIVE_MODEL_KEY: Record<LlmModelSettingKey, "default" | "mini"> = {
  "llm-metabot-provider": "default",
  "llm-mini-model": "mini",
};

function fallbackNotice(
  settingKey: LlmModelSettingKey,
  activeModel: LlmActiveModel,
) {
  const provider = (
    <strong key="provider">{activeModel.connection_name}</strong>
  );
  const model = (
    <strong key="model">{activeModel.model_name ?? activeModel.model}</strong>
  );
  return settingKey === "llm-mini-model"
    ? jt`Quick tasks are currently running on ${provider} using ${model}.`
    : jt`Metabot is currently running on ${provider} using ${model}.`;
}

export function LlmModelPicker({
  settingKey = "llm-metabot-provider",
  label = t`Model`,
  description = t`Metabot uses this model by default. Models are listed per connected provider.`,
}: {
  settingKey?: LlmModelSettingKey;
  label?: string;
  description?: string;
}) {
  const {
    value: modelRef,
    updateSetting,
    settingDetails,
  } = useAdminSetting(settingKey);
  const { modelOptions, modelNameByRef, isLoading, error } =
    useLlmConnectionModels();

  const hasAiControls = useHasTokenFeature("ai_controls");
  const { value: isFallbackEnabled } = useAdminSetting(
    "llm-provider-fallback-enabled?",
  );
  const { data: activeModels } = useGetLlmActiveModelQuery(
    hasAiControls && isFallbackEnabled ? undefined : skipToken,
  );
  const activeModel = activeModels?.[ACTIVE_MODEL_KEY[settingKey]];

  const isEnvSetting = !!settingDetails?.is_env_setting;
  const envVarName = isEnvSetting ? settingDetails?.env_name : undefined;

  const handleChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    await updateSetting({ key: settingKey, value });
  };

  return (
    <Stack gap="sm">
      <Select
        label={label}
        description={description}
        placeholder={isLoading ? t`Loading models...` : t`Select a model`}
        error={error ? getErrorMessage(error, t`Unable to load models.`) : null}
        data={modelOptions}
        value={modelRef ?? null}
        onChange={handleChange}
        disabled={isEnvSetting || isLoading}
        searchable
        nothingFoundMessage={t`No models found`}
        renderOption={(item) => (
          <DefaultSelectItem
            {...item.option}
            selected={item.checked}
            label={modelNameByRef[item.option.value] ?? item.option.label}
          />
        )}
      />
      {envVarName && <SetByEnvVar varName={envVarName} />}
      {activeModel?.is_fallback && (
        <Text size="sm" c="text-secondary" data-testid="active-provider-notice">
          {fallbackNotice(settingKey, activeModel)}
        </Text>
      )}
    </Stack>
  );
}
