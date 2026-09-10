import { useMemo, useState } from "react";
import { t } from "ttag";

import { ChartTypePicker } from "metabase/metrics-viewer/components/MetricControls/LeftControls/ChartTypePicker";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils/dimension-breakout-config";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Icon,
  Modal,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import { uuid } from "metabase/utils/uuid";

import {
  trackMetricCubeViewerCardAdded,
  trackMetricCubeViewerCardEdited,
} from "../../analytics";
import { useMetricCubeViewerContext } from "../../context";
import type { CubeCard, CubeCatalog, CubeSeries } from "../../types";

import {
  type CardDraft,
  MAX_SERIES,
  canUseSecondDimension,
  createEmptyDraft,
  draftToCard,
  getBreakoutType,
  getSecondDimensionOptions,
  getSupportedDimensions,
  normalizeDraft,
} from "./utils";

const NONE_VALUE = "__none__";

export interface CardEditorModalProps {
  /** Omit to create a new card. */
  card?: CubeCard;
  onClose: () => void;
}

export function CardEditorModal({ card, onClose }: CardEditorModalProps) {
  const { catalog, actions, generator } = useMetricCubeViewerContext();
  const [draft, setDraft] = useState<CardDraft | null>(
    () => card ?? createEmptyDraft(catalog),
  );

  const handleSave = () => {
    if (!draft) {
      return;
    }
    if (card) {
      actions.updateCard(draftToCard(draft, card.id));
      trackMetricCubeViewerCardEdited(generator.id);
    } else {
      actions.addCard(draftToCard(draft, uuid()));
      trackMetricCubeViewerCardAdded(generator.id);
    }
    onClose();
  };

  return (
    <Modal
      opened
      title={card ? t`Edit card` : t`New card`}
      size="lg"
      padding="xxl"
      onClose={onClose}
    >
      <Stack gap="xl" mt="sm">
        {draft && (
          <CardEditorFields
            catalog={catalog}
            draft={draft}
            onChange={(next) => setDraft(normalizeDraft(catalog, next))}
          />
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <Button variant="filled" disabled={!draft} onClick={handleSave}>
            {t`Save`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface CardEditorFieldsProps {
  catalog: CubeCatalog;
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
}

function CardEditorFields({ catalog, draft, onChange }: CardEditorFieldsProps) {
  const measureOptions = useMemo(
    () =>
      catalog.measures.map((measure) => ({
        value: String(measure.id),
        label: measure.name,
      })),
    [catalog.measures],
  );
  const segmentOptions = useMemo(
    () => [
      { value: NONE_VALUE, label: t`None` },
      ...catalog.segments.map((segment) => ({
        value: String(segment.id),
        label: segment.name,
      })),
    ],
    [catalog.segments],
  );
  const dimensionOptions = useMemo(
    () => [
      { value: NONE_VALUE, label: t`None (show total)` },
      ...getSupportedDimensions(catalog, draft.series).map((dimension) => ({
        value: dimension.key,
        label: dimension.label,
      })),
    ],
    [catalog, draft.series],
  );
  const secondDimensionOptions = useMemo(
    () => getSecondDimensionOptions(catalog, draft),
    [catalog, draft],
  );
  const recommendedKeys = useMemo(
    () =>
      new Set(
        secondDimensionOptions
          .filter((option) => option.isRecommended)
          .map((option) => option.dimension.key),
      ),
    [secondDimensionOptions],
  );
  const secondDimensionSelectOptions = useMemo(
    () => [
      { value: NONE_VALUE, label: t`None` },
      ...secondDimensionOptions.map(({ dimension }) => ({
        value: dimension.key,
        label: dimension.label,
      })),
    ],
    [secondDimensionOptions],
  );

  const [firstDimensionKey, secondDimensionKey] = draft.dimensionKeys;
  const chartTypes = getDimensionBreakoutConfig(
    getBreakoutType(catalog, draft.dimensionKeys),
  ).availableDisplayTypes;

  const updateSeries = (index: number, series: CubeSeries) => {
    onChange({
      ...draft,
      series: draft.series.map((entry, i) => (i === index ? series : entry)),
    });
  };

  const removeSeries = (index: number) => {
    onChange({
      ...draft,
      series: draft.series.filter((_entry, i) => i !== index),
    });
  };

  const addSeries = () => {
    const [firstMeasure] = catalog.measures;
    if (!firstMeasure) {
      return;
    }
    onChange({
      ...draft,
      series: [...draft.series, { measureId: firstMeasure.id, segmentIds: [] }],
    });
  };

  const setFirstDimension = (value: string | null) => {
    const keys =
      value == null || value === NONE_VALUE
        ? []
        : [value, ...(secondDimensionKey != null ? [secondDimensionKey] : [])];
    onChange({ ...draft, dimensionKeys: keys });
  };

  const setSecondDimension = (value: string | null) => {
    if (firstDimensionKey == null) {
      return;
    }
    const keys =
      value == null || value === NONE_VALUE
        ? [firstDimensionKey]
        : [firstDimensionKey, value];
    onChange({ ...draft, dimensionKeys: keys });
  };

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Text fw="bold">{t`Series`}</Text>
        {draft.series.map((series, index) => (
          <Group key={index} gap="sm" wrap="nowrap" align="flex-end">
            <Select
              aria-label={t`Measure`}
              placeholder={t`Measure`}
              data={measureOptions}
              value={String(series.measureId)}
              allowDeselect={false}
              searchable
              flex={1}
              onChange={(value) => {
                const measure = catalog.measures.find(
                  (m) => String(m.id) === value,
                );
                if (measure) {
                  updateSeries(index, { ...series, measureId: measure.id });
                }
              }}
            />
            <Select
              aria-label={t`Segment`}
              placeholder={t`Segment`}
              data={segmentOptions}
              value={
                series.segmentIds[0] != null
                  ? String(series.segmentIds[0])
                  : NONE_VALUE
              }
              allowDeselect={false}
              flex={1}
              onChange={(value) => {
                const segment = catalog.segments.find(
                  (s) => String(s.id) === value,
                );
                updateSeries(index, {
                  ...series,
                  segmentIds: segment ? [segment.id] : [],
                });
              }}
            />
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={t`Remove series`}
              disabled={draft.series.length <= 1}
              onClick={() => removeSeries(index)}
            >
              <Icon name="close" />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="subtle"
          size="compact-md"
          leftSection={<Icon name="add" />}
          disabled={draft.series.length >= MAX_SERIES}
          style={{ alignSelf: "flex-start" }}
          onClick={addSeries}
        >
          {t`Add measure`}
        </Button>
      </Stack>

      <Select
        label={t`Dimension`}
        data={dimensionOptions}
        value={firstDimensionKey ?? NONE_VALUE}
        allowDeselect={false}
        searchable
        onChange={setFirstDimension}
      />

      <Select
        label={t`Second dimension`}
        description={t`Available for a single series with a non-location dimension.`}
        data={secondDimensionSelectOptions}
        value={secondDimensionKey ?? NONE_VALUE}
        allowDeselect={false}
        disabled={!canUseSecondDimension(catalog, draft)}
        renderOption={({ option }) => (
          <Group gap="sm" wrap="nowrap">
            <span>{option.label}</span>
            {recommendedKeys.has(option.value) && (
              <Badge variant="light" color="core-brand">
                {t`Recommended`}
              </Badge>
            )}
          </Group>
        )}
        onChange={setSecondDimension}
      />

      {chartTypes.length > 1 && (
        <Stack gap="xs" align="flex-start">
          <Text fw="bold">{t`Visualization`}</Text>
          <ChartTypePicker
            chartTypes={chartTypes}
            value={draft.display}
            onChange={(display) => onChange({ ...draft, display })}
          />
        </Stack>
      )}
    </Stack>
  );
}
