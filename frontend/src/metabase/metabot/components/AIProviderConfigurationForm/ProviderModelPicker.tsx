import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetMetabotSettingsQuery,
  useUpdateMetabotSettingsMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { type ComboboxItem, Select } from "metabase/ui";
import type {
  MetabotProvider,
  MetabotSettingsResponse,
} from "metabase-types/api";

type MetabotModelOption = ComboboxItem & {
  group?: string | null;
};

export function useProviderModelsQuery(
  provider: MetabotProvider,
  { skip }: { skip: boolean },
) {
  const modelsQuery = useGetMetabotSettingsQuery({ provider }, { skip });

  return {
    modelsQuery,
    credentialsError:
      modelsQuery.currentData?.["credentials-error"] ?? undefined,
  };
}

export const ProviderModelPicker = ({
  provider,
  connectedModel,
  models,
  isLoading,
  loadError,
  disabled,
}: {
  provider: Exclude<MetabotProvider, "metabase">;
  connectedModel: string | undefined;
  models: MetabotSettingsResponse["models"];
  isLoading: boolean;
  loadError: unknown;
  disabled: boolean;
}) => {
  const [model, setModel] = useState<string | undefined>(connectedModel);
  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();
  const [sendToast] = useToast();

  useEffect(() => {
    setModel(connectedModel);
  }, [connectedModel]);

  const modelOptions = useMemo(() => getLlmModelOptions(models), [models]);

  const handleModelChange = async (value: string) => {
    setModel(value);

    if (!value) {
      return;
    }

    const result = await updateMetabotSettings({ provider, model: value });

    if (!result.error) {
      sendToast({
        message: t`Settings saved successfully`,
        icon: "check",
      });
    }
  };

  const loadErrorMessage = loadError
    ? getErrorMessage(loadError, t`Unable to load models.`)
    : undefined;
  const saveErrorMessage = updateMetabotSettingsResult.error
    ? getErrorMessage(
        updateMetabotSettingsResult.error,
        t`Unable to save provider settings.`,
      )
    : undefined;
  const error = loadErrorMessage ?? saveErrorMessage;

  return (
    <Select
      label={t`Model`}
      placeholder={isLoading ? t`Loading models...` : t`Select a model`}
      description={t`Available models are fetched from the selected provider using its configured credentials.`}
      error={error}
      data={modelOptions}
      value={model}
      onChange={handleModelChange}
      disabled={disabled}
      searchable
      nothingFoundMessage={t`No models found`}
    />
  );
};

const getLlmModelOptions = (models: MetabotSettingsResponse["models"]) => {
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: m.display_name,
    group: m.group,
  }));

  const sel = (o: MetabotModelOption) => _.pick(o, ["value", "label"]);
  // group model options if needed
  return _.every(modelOptions, (o) => !o.group)
    ? modelOptions.map(sel)
    : _.map(
        _.groupBy(modelOptions, (o) => o.group ?? t`Other`),
        (items, group) => ({ group, items: items.map(sel) }),
      );
};
