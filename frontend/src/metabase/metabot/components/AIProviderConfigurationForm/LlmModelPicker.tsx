import { useMemo } from "react";
import { t } from "ttag";

import { useListLlmModelsQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useAdminSetting } from "metabase/settings";
import { Select, Stack, Text } from "metabase/ui";
import type { LlmConnectionModels } from "metabase-types/api";

export function LlmModelPicker() {
  const {
    value: modelRef,
    updateSetting,
    settingDetails,
  } = useAdminSetting("llm-metabot-provider");
  const { data: connections = [], isLoading, error } = useListLlmModelsQuery();
  const [sendToast] = useToast();

  const options = useMemo(() => getModelOptions(connections), [connections]);
  const failed = connections.filter((connection) => connection.error);

  const isEnvSetting = !!settingDetails?.is_env_setting;

  const handleChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    const result = await updateSetting({
      key: "llm-metabot-provider",
      value,
    });
    if (!result?.error) {
      sendToast({ message: t`Settings saved successfully`, icon: "check" });
    }
  };

  return (
    <Stack gap="sm">
      <Select
        label={t`Model`}
        description={t`Metabot uses this model by default. Models are listed per connected provider.`}
        placeholder={isLoading ? t`Loading models...` : t`Select a model`}
        error={error ? getErrorMessage(error, t`Unable to load models.`) : null}
        data={options}
        value={modelRef ?? null}
        onChange={handleChange}
        disabled={isEnvSetting || isLoading}
        searchable
        nothingFoundMessage={t`No models found`}
      />
      {failed.map((connection) => (
        <Text key={connection.key} size="sm" c="error">
          {t`Couldn't load models from ${connection.name}: ${connection.error}`}
        </Text>
      ))}
    </Stack>
  );
}

function getModelOptions(connections: LlmConnectionModels[]) {
  return connections
    .filter((connection) => connection.models.length > 0)
    .map((connection) => ({
      group: connection.name,
      items: connection.models.map((model) => ({
        value: `${connection.key}/${model.id}`,
        label: model.group
          ? `${model.group} · ${model.display_name}`
          : model.display_name,
      })),
    }));
}
