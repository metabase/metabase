import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useLlmConnectionModels } from "metabase/metabot/hooks";
import { useAdminSetting } from "metabase/settings";
import { DefaultSelectItem, Select, Stack } from "metabase/ui";

export function LlmModelPicker() {
  const {
    value: modelRef,
    updateSetting,
    settingDetails,
  } = useAdminSetting("llm-metabot-provider");
  const { modelOptions, modelNameByRef, isLoading, error } =
    useLlmConnectionModels();

  const isEnvSetting = !!settingDetails?.is_env_setting;
  const envVarName = isEnvSetting ? settingDetails?.env_name : undefined;

  const handleChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    await updateSetting({ key: "llm-metabot-provider", value });
  };

  return (
    <Stack gap="sm">
      <Select
        label={t`Model`}
        description={t`Metabot uses this model by default. Models are listed per connected provider.`}
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
    </Stack>
  );
}
