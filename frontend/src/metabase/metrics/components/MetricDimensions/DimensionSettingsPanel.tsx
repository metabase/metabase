import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  useSetDefaultMetricDimensionMutation,
  useUpdateMetricDimensionMutation,
} from "metabase/api/metric";
import { useMetadataToasts } from "metabase/common/hooks";
import { getDimensionIcon } from "metabase/common/utils/columns";
import {
  trackMetricDimensionRemoveDefault,
  trackMetricDimensionSetDefault,
  trackMetricDimensionUpdated,
} from "metabase/metrics/analytics";
import {
  Button,
  Group,
  Icon,
  Input,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "metabase/ui";
import type {
  CardQueryMetadata,
  MetricDimension,
  MetricId,
  TemporalUnit,
  UpdateMetricDimensionRequest,
} from "metabase-types/api";

import {
  DimensionTimeGroupingSelect,
  useMetricDimensionTemporalUnits,
} from "./DimensionTimeGroupingSelect";
import S from "./MetricDimensions.module.css";
import {
  getDimensionTypeLabel,
  getSourceColumnLabel,
  isOrphaned,
} from "./utils";

export type DimensionChanges = Omit<
  UpdateMetricDimensionRequest,
  "metricId" | "dimensionId"
>;

interface DimensionSettingsPanelProps {
  metricId: MetricId;
  dimension: MetricDimension;
  isFetching: boolean;
  queryMetadata: CardQueryMetadata;
}

/** Settings for one dimension of a saved metric; changes save as you make them */
export function DimensionSettingsPanel({
  metricId,
  dimension,
  isFetching,
  queryMetadata,
}: DimensionSettingsPanelProps) {
  const [updateDimension] = useUpdateMetricDimensionMutation();
  const [setDefaultDimension, { isLoading: isSettingDefault }] =
    useSetDefaultMetricDimensionMutation();
  const temporalUnits = useMetricDimensionTemporalUnits(metricId, dimension);
  const { sendErrorToast } = useMetadataToasts();

  const handleUpdate = async (changes: DimensionChanges) => {
    try {
      await updateDimension({
        metricId,
        dimensionId: dimension.id,
        ...changes,
      }).unwrap();
      trackMetricDimensionUpdated(metricId, dimension.id, "success");
      return true;
    } catch {
      trackMetricDimensionUpdated(metricId, dimension.id, "failure");
      sendErrorToast(t`Couldn't update ${dimension.display_name}`);
      return false;
    }
  };

  const handleSetDefault = async () => {
    try {
      await setDefaultDimension({
        metricId,
        dimension_id: dimension.id,
      }).unwrap();
      trackMetricDimensionSetDefault(metricId, dimension.id, "success");
    } catch {
      trackMetricDimensionSetDefault(metricId, dimension.id, "failure");
      sendErrorToast(t`Couldn't make ${dimension.display_name} the default`);
    }
  };

  const handleRemoveDefault = async () => {
    try {
      await setDefaultDimension({ metricId, dimension_id: null }).unwrap();
      trackMetricDimensionRemoveDefault(metricId, dimension.id, "success");
    } catch {
      trackMetricDimensionRemoveDefault(metricId, dimension.id, "failure");
      sendErrorToast(
        t`Couldn't remove ${dimension.display_name} as the default`,
      );
    }
  };

  return (
    <DimensionSettingsPanelView
      dimension={dimension}
      isDefaultLoading={isSettingDefault || isFetching}
      sourceColumnLabel={getSourceColumnLabel(dimension, queryMetadata)}
      temporalUnits={temporalUnits}
      onUpdate={handleUpdate}
      onSetDefault={handleSetDefault}
      onRemoveDefault={handleRemoveDefault}
    />
  );
}

interface DimensionSettingsPanelViewProps {
  dimension: MetricDimension;
  isDefaultLoading: boolean;
  sourceColumnLabel: string | null;
  temporalUnits: TemporalUnit[];
  /** Resolves to whether the change stuck; the field reverts when it didn't */
  onUpdate: (changes: DimensionChanges) => Promise<boolean>;
  onSetDefault: () => void;
  onRemoveDefault: () => void;
}

/** The dimension settings form, independent of where the dimension is stored */
export function DimensionSettingsPanelView({
  dimension,
  isDefaultLoading,
  sourceColumnLabel,
  temporalUnits,
  onUpdate,
  onSetDefault,
  onRemoveDefault,
}: DimensionSettingsPanelViewProps) {
  const [displayName, setDisplayName] = useState(dimension.display_name);
  const [description, setDescription] = useState(dimension.description ?? "");
  const [defaultTemporalUnit, setDefaultTemporalUnit] = useState(
    dimension.default_temporal_unit,
  );

  // An orphaned dimension can't be made the default, but one that already is
  // still needs a way out.
  const showDefaultButton = !isOrphaned(dimension) || dimension.default;

  useEffect(() => {
    setDefaultTemporalUnit(dimension.default_temporal_unit);
  }, [dimension.default_temporal_unit]);

  const handleNameBlur = async () => {
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setDisplayName(dimension.display_name);
      return;
    }

    setDisplayName(nextDisplayName);
    if (nextDisplayName !== dimension.display_name) {
      const isPersisted = await onUpdate({ display_name: nextDisplayName });
      if (!isPersisted) {
        setDisplayName(dimension.display_name);
      }
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (dimension.description ?? "")) {
      onUpdate({ description });
    }
  };

  const handleTimeGroupingChange = async (unit: TemporalUnit) => {
    const previousUnit = defaultTemporalUnit;
    setDefaultTemporalUnit(unit);
    const isPersisted = await onUpdate({ default_temporal_unit: unit });
    if (!isPersisted) {
      setDefaultTemporalUnit(previousUnit);
    }
  };

  return (
    <Stack
      className={S.column}
      data-testid="dimension-settings-panel"
      gap="xl"
      pt="xl"
    >
      <Group
        align="center"
        flex="0 0 2rem"
        justify="space-between"
        wrap="nowrap"
      >
        <Title order={4}>{t`Settings for ${dimension.display_name}`}</Title>
        {showDefaultButton && (
          <Button
            loading={isDefaultLoading}
            onClick={dimension.default ? onRemoveDefault : onSetDefault}
          >
            {dimension.default ? t`Remove default` : t`Set as default`}
          </Button>
        )}
      </Group>

      <Group align="flex-end" wrap="nowrap">
        <TextInput
          flex={1}
          miw={0}
          label={t`Display name`}
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          onBlur={handleNameBlur}
        />
        <DimensionTimeGroupingSelect
          temporalUnits={temporalUnits}
          value={defaultTemporalUnit}
          onChange={handleTimeGroupingChange}
        />
      </Group>

      <Textarea
        label={t`Description`}
        placeholder={t`Add a description`}
        value={description}
        autosize
        minRows={3}
        onChange={(event) => setDescription(event.currentTarget.value)}
        onBlur={handleDescriptionBlur}
      />

      <Input.Wrapper label={t`Dimension type`} data-testid="dimension-type">
        <Group gap="sm">
          <Icon name={getDimensionIcon(dimension)} c="text-secondary" />
          <Text>{getDimensionTypeLabel(dimension)}</Text>
        </Group>
      </Input.Wrapper>

      {sourceColumnLabel && (
        <Input.Wrapper label={t`Source column`} data-testid="dimension-source">
          <Text>{sourceColumnLabel}</Text>
        </Input.Wrapper>
      )}

      {dimension.default && (
        <Group gap="xxs">
          <Icon name="star_filled" c="core-brand" />
          <Text fw="bold">{t`Default dimension`}</Text>
        </Group>
      )}
    </Stack>
  );
}
