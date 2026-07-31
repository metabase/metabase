import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  useSetDefaultMetricDimensionMutation,
  useUpdateMetricDimensionMutation,
} from "metabase/api/metric";
import { getDimensionIcon } from "metabase/common/metrics/utils/dimensions";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
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

import { DimensionTimeGroupingSelect } from "./DimensionTimeGroupingSelect";
import S from "./MetricDimensions.module.css";
import {
  getDimensionTypeLabel,
  getSourceColumnLabel,
  isOrphaned,
} from "./utils";

type DimensionChanges = Omit<
  UpdateMetricDimensionRequest,
  "metricId" | "dimensionId"
>;

interface DimensionSettingsPanelProps {
  metricId: MetricId;
  dimension: MetricDimension;
  isFetching: boolean;
  queryMetadata: CardQueryMetadata;
}

export function DimensionSettingsPanel({
  metricId,
  dimension,
  isFetching,
  queryMetadata,
}: DimensionSettingsPanelProps) {
  const [updateDimension] = useUpdateMetricDimensionMutation();
  const [setDefaultDimension, { isLoading: isSettingDefault }] =
    useSetDefaultMetricDimensionMutation();

  const [displayName, setDisplayName] = useState(dimension.display_name);
  const [description, setDescription] = useState(dimension.description ?? "");
  const [defaultTemporalUnit, setDefaultTemporalUnit] = useState(
    dimension.default_temporal_unit,
  );

  const { sendErrorToast } = useMetadataToasts();

  const sourceColumnLabel = getSourceColumnLabel(dimension, queryMetadata);
  const showSetAsDefaultButton = !isOrphaned(dimension) && !dimension.default;

  useEffect(() => {
    setDefaultTemporalUnit(dimension.default_temporal_unit);
  }, [dimension.default_temporal_unit]);

  const persist = async (changes: DimensionChanges) => {
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

  const handleNameBlur = async () => {
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setDisplayName(dimension.display_name);
      return;
    }

    setDisplayName(nextDisplayName);
    if (nextDisplayName !== dimension.display_name) {
      const isPersisted = await persist({ display_name: nextDisplayName });
      if (!isPersisted) {
        setDisplayName(dimension.display_name);
      }
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (dimension.description ?? "")) {
      persist({ description });
    }
  };

  const handleTimeGroupingChange = async (unit: TemporalUnit) => {
    const previousUnit = defaultTemporalUnit;
    setDefaultTemporalUnit(unit);
    const isPersisted = await persist({ default_temporal_unit: unit });
    if (!isPersisted) {
      setDefaultTemporalUnit(previousUnit);
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

  return (
    <Stack
      className={S.column}
      data-testid="dimension-settings-panel"
      gap="lg"
      pt="lg"
    >
      <Group
        align="center"
        flex="0 0 2.25rem"
        justify="space-between"
        wrap="nowrap"
      >
        <Title order={4}>{t`Settings for ${dimension.display_name}`}</Title>
        {showSetAsDefaultButton && (
          <Button
            loading={isSettingDefault || isFetching}
            onClick={handleSetDefault}
            size="sm"
            variant="default"
          >
            {t`Set as default`}
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
          metricId={metricId}
          dimension={dimension}
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
        <Group gap="xs">
          <Icon name="star_filled" c="brand" />
          <Text fw="bold">{t`Default dimension`}</Text>
        </Group>
      )}
    </Stack>
  );
}
