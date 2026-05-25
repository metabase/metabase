import { useCallback, useMemo } from "react";

import { DimensionPillBar } from "metabase/metrics-viewer/components/DimensionPillBar";
import { MetricControls } from "metabase/metrics-viewer/components/MetricControls";
import { MetricsViewerVisualization } from "metabase/metrics-viewer/components/MetricsViewerVisualization";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutProjectionConfig,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerDisplayType,
  MetricsViewerFormulaEntity,
  SourceColorMap,
} from "metabase/metrics-viewer/types/viewer-state";
import {
  type AvailableDimensionsResult,
  type DimensionFilterValue,
  buildDimensionItemsFromDefinitions,
  getDimensionBreakoutConfig,
  getProjectionInfo,
  shouldShowStackSeries,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import { Box, Flex, Stack } from "metabase/ui";
import { getObjectKeys } from "metabase/utils/objects";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  CardId,
  SingleSeries,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

type MetricsViewerDimensionBreakoutContentProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  dimensionBreakout: MetricsViewerDimensionBreakoutState;
  queriesAreLoading: boolean;
  queriesError: string | null;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  metricSlots: MetricSlot[];
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  sourceColors: SourceColorMap;
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  onDimensionBreakoutUpdate: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
};

export function MetricsViewerDimensionBreakoutContent({
  definitions,
  formulaEntities,
  dimensionBreakout,
  queriesAreLoading,
  queriesError,
  modifiedDefinitionsBySlotIndex,
  metricSlots,
  series: rawSeries,
  cardIdToEntityIndex,
  sourceColors,
  availableDimensions,
  sourceOrder,
  onDimensionBreakoutUpdate,
}: MetricsViewerDimensionBreakoutContentProps) {
  const dimensionFilter = getDimensionBreakoutConfig(
    dimensionBreakout.type,
  ).dimensionPredicate;

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        dimensionBreakout.dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        dimensionBreakout.projectionConfig,
        dimensionFilter,
      ),
    [
      definitions,
      dimensionBreakout.dimensionMapping,
      modifiedDefinitionsBySlotIndex,
      sourceColors,
      metricSlots,
      formulaEntities,
      dimensionBreakout.projectionConfig,
      dimensionFilter,
    ],
  );

  const definitionForControls = useMemo((): MetricDefinition | null => {
    for (const key of getObjectKeys(dimensionBreakout.dimensionMapping)) {
      const slotIndex = Number(key);
      const modDef = modifiedDefinitionsBySlotIndex.get(slotIndex);
      if (!modDef) {
        continue;
      }
      const projs = LibMetric.projections(modDef);
      if (projs.length > 0) {
        return modDef;
      }
    }
    return null;
  }, [dimensionBreakout.dimensionMapping, modifiedDefinitionsBySlotIndex]);

  const allFilterDimensions = useMemo(() => {
    const filterDimensions: DimensionMetadata[] = [];
    for (const key of getObjectKeys(dimensionBreakout.dimensionMapping)) {
      const slotIndex = Number(key);
      const modDef = modifiedDefinitionsBySlotIndex.get(slotIndex);
      if (!modDef) {
        continue;
      }
      const projInfo = getProjectionInfo(modDef);
      if (projInfo.filterDimension) {
        filterDimensions.push(projInfo.filterDimension);
      }
    }
    return filterDimensions;
  }, [dimensionBreakout.dimensionMapping, modifiedDefinitionsBySlotIndex]);

  const updateProjectionConfig = useCallback(
    (updates: Partial<MetricsViewerDimensionBreakoutProjectionConfig>) => {
      onDimensionBreakoutUpdate({
        projectionConfig: { ...dimensionBreakout.projectionConfig, ...updates },
      });
    },
    [onDimensionBreakoutUpdate, dimensionBreakout.projectionConfig],
  );

  const handleDimensionFilterChange = useCallback(
    (value: DimensionFilterValue | undefined) => {
      updateProjectionConfig({ dimensionFilter: value });
    },
    [updateProjectionConfig],
  );

  const handleTemporalUnitChange = useCallback(
    (unit: TemporalUnit | undefined) => {
      updateProjectionConfig({ temporalUnit: unit });
    },
    [updateProjectionConfig],
  );

  const handleBinningChange = useCallback(
    (binningStrategy: string | undefined) => {
      updateProjectionConfig({ binningStrategy });
    },
    [updateProjectionConfig],
  );

  const handleDisplayTypeChange = useCallback(
    (display: MetricsViewerDisplayType) => {
      onDimensionBreakoutUpdate({ display });
    },
    [onDimensionBreakoutUpdate],
  );

  const handleVisualizationSettingsChange = useCallback(
    (updates: Partial<VisualizationSettings>) => {
      onDimensionBreakoutUpdate({
        visualizationSettings: {
          ...dimensionBreakout.visualizationSettings,
          ...updates,
        },
      });
    },
    [onDimensionBreakoutUpdate, dimensionBreakout.visualizationSettings],
  );

  const handleShowColumnLabelsChange = useCallback(
    (showColumnLabels: boolean) => {
      onDimensionBreakoutUpdate({ showColumnLabels });
    },
    [onDimensionBreakoutUpdate],
  );

  const handleBrush = useCallback(
    ({ start, end }: { start: number; end: number }) => {
      updateProjectionConfig({
        dimensionFilter: {
          type: "specific-date",
          operator: "between",
          values: [new Date(start), new Date(end)],
          hasTime: true,
        },
      });
    },
    [updateProjectionConfig],
  );

  const showStackSeries = shouldShowStackSeries(
    dimensionBreakout.display,
    rawSeries,
    formulaEntities,
    definitions,
  );

  const isTimeDimensionBreakout = dimensionBreakout.type === "time";

  const dimensionBreakoutConfig = getDimensionBreakoutConfig(
    dimensionBreakout.type,
  );
  const hasAnyOptions = dimensionItems.some((item) =>
    item.type === "expression"
      ? item.metricSources.some((s) => s.availableOptions.length > 0)
      : item.availableOptions.length > 0,
  );
  const hideDimensionPill =
    dimensionBreakoutConfig.minDimensions === 0 && !hasAnyOptions;
  const showColumnLabels = dimensionBreakout.showColumnLabels === true;

  return (
    <Stack flex="1 0 auto" gap={0}>
      <MetricsViewerVisualization
        rawSeries={rawSeries}
        onBrush={isTimeDimensionBreakout ? handleBrush : undefined}
        definitions={definitions}
        formulaEntities={formulaEntities}
        metricSlots={metricSlots}
        dimensionBreakout={dimensionBreakout}
        onDimensionBreakoutUpdate={onDimensionBreakoutUpdate}
        cardIdToEntityIndex={cardIdToEntityIndex}
        queriesAreLoading={queriesAreLoading}
        queriesError={queriesError}
      />
      {!hideDimensionPill && showColumnLabels && (
        <Box mt="sm">
          <DimensionPillBar items={dimensionItems} />
        </Box>
      )}
      {definitionForControls && (
        <Flex mt="md" justify="center" align="center">
          <MetricControls
            definition={definitionForControls}
            displayType={dimensionBreakout.display}
            dimensionBreakoutType={dimensionBreakout.type}
            dimensionBreakoutLabel={dimensionBreakout.label}
            dimensionFilter={dimensionBreakout.projectionConfig.dimensionFilter}
            allFilterDimensions={allFilterDimensions}
            availableDimensions={availableDimensions}
            sourceOrder={sourceOrder}
            onDisplayTypeChange={handleDisplayTypeChange}
            onDimensionFilterChange={handleDimensionFilterChange}
            onTemporalUnitChange={handleTemporalUnitChange}
            onBinningChange={handleBinningChange}
            showStackSeries={showStackSeries}
            canToggleColumnLabels={!hideDimensionPill}
            showColumnLabels={showColumnLabels}
            onShowColumnLabelsChange={handleShowColumnLabelsChange}
            visualizationSettings={dimensionBreakout.visualizationSettings}
            onVisualizationSettingsChange={handleVisualizationSettingsChange}
          />
        </Flex>
      )}
    </Stack>
  );
}
