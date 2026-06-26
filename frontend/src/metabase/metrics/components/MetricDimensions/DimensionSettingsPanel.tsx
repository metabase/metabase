import { useState } from "react";
import { t } from "ttag";

import { useUpdateMetricDimensionMutation } from "metabase/api/metric";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Select, Stack, TextInput, Textarea, Title } from "metabase/ui";
import type {
  MetricDimension,
  MetricId,
  UpdateMetricDimensionRequest,
} from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { getDimensionSourceOptions } from "./utils";

type DimensionChanges = Omit<
  UpdateMetricDimensionRequest,
  "metricId" | "dimensionId"
>;

interface DimensionSettingsPanelProps {
  metricId: MetricId;
  dimension: MetricDimension;
}

export function DimensionSettingsPanel({
  metricId,
  dimension,
}: DimensionSettingsPanelProps) {
  const dispatch = useDispatch();
  const [updateDimension] = useUpdateMetricDimensionMutation();

  const [displayName, setDisplayName] = useState(dimension.display_name);
  const [description, setDescription] = useState(dimension.description ?? "");

  const sourceOptions = getDimensionSourceOptions(dimension);
  const [sourceValue, setSourceValue] = useState<string | null>(
    sourceOptions[0]?.value ?? null,
  );

  const persist = async (changes: DimensionChanges) => {
    try {
      await updateDimension({
        metricId,
        dimensionId: dimension.id,
        ...changes,
      }).unwrap();
    } catch {
      dispatch(
        addUndo({ message: t`Couldn't update ${dimension.display_name}` }),
      );
    }
  };

  const handleNameBlur = () => {
    if (displayName !== dimension.display_name) {
      persist({ display_name: displayName });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (dimension.description ?? "")) {
      persist({ description });
    }
  };

  const handleSourceChange = (value: string | null) => {
    setSourceValue(value);
    const option = sourceOptions.find((candidate) => candidate.value === value);
    if (option) {
      persist({ source: option.source });
    }
  };

  return (
    <Stack gap="lg" className={S.column} data-testid="dimension-settings-panel">
      <Title order={4}>{t`Settings for ${dimension.display_name}`}</Title>

      <TextInput
        label={t`Display name`}
        value={displayName}
        onChange={(event) => setDisplayName(event.currentTarget.value)}
        onBlur={handleNameBlur}
      />

      <Textarea
        label={t`Description`}
        placeholder={t`Add a description`}
        value={description}
        autosize
        minRows={3}
        onChange={(event) => setDescription(event.currentTarget.value)}
        onBlur={handleDescriptionBlur}
      />

      {sourceOptions.length > 0 && (
        <Select
          label={t`Source column`}
          data={sourceOptions.map(({ value, label }) => ({ value, label }))}
          value={sourceValue}
          onChange={handleSourceChange}
        />
      )}
    </Stack>
  );
}
