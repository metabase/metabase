import { useState } from "react";
import { t } from "ttag";

import {
  useSetDefaultMetricDimensionMutation,
  useUpdateMetricDimensionMutation,
} from "metabase/api/metric";
import { useMetadataToasts } from "metabase/metadata/hooks";
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
  MetricDimension,
  MetricId,
  UpdateMetricDimensionRequest,
} from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import {
  getDimensionIcon,
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
}

export function DimensionSettingsPanel({
  metricId,
  dimension,
  isFetching,
}: DimensionSettingsPanelProps) {
  const [updateDimension] = useUpdateMetricDimensionMutation();
  const [setDefaultDimension, { isLoading: isSettingDefault }] =
    useSetDefaultMetricDimensionMutation();

  const [displayName, setDisplayName] = useState(dimension.display_name);
  const [description, setDescription] = useState(dimension.description ?? "");

  const { sendErrorToast } = useMetadataToasts();

  const sourceColumnLabel = getSourceColumnLabel(dimension);
  const showSetAsDefaultButton = !isOrphaned(dimension) && !dimension.default;

  const persist = async (changes: DimensionChanges) => {
    try {
      await updateDimension({
        metricId,
        dimensionId: dimension.id,
        ...changes,
      }).unwrap();
    } catch {
      sendErrorToast(t`Couldn't update ${dimension.display_name}`);
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

  const handleSetDefault = async () => {
    try {
      await setDefaultDimension({
        metricId,
        dimension_id: dimension.id,
      }).unwrap();
    } catch {
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
