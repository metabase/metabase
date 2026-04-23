import { useCallback, useMemo } from "react";

import { Box, Flex, Stack } from "metabase/ui";
import { getObjectKeys, getObjectValues } from "metabase/utils/objects";
import { isNotNull } from "metabase/utils/types";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  CardId,
  SingleSeries,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerFormulaEntity,
  MetricsViewerTabProjectionConfig,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../../types/viewer-state";
import { getProjectionInfo } from "../../../utils/definition-builder";
import type { DimensionFilterValue } from "../../../utils/dimension-filters";
import type { MetricSlot } from "../../../utils/metric-slots";
import { buildDimensionItemsFromDefinitions } from "../../../utils/series";
import { DISPLAY_TYPE_REGISTRY, getTabConfig } from "../../../utils/tab-config";
import { DimensionPillBar } from "../../DimensionPillBar";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type MetricsViewerTabContentProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  tab: MetricsViewerTabState;
  queriesAreLoading: boolean;
  queriesError: string | null;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  metricSlots: MetricSlot[];
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  sourceColors: SourceColorMap;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onDimensionRemove: (slotIndex: number) => void;
};

export function MetricsViewerTabContent({
  definitions,
  formulaEntities,
  tab,
  queriesAreLoading,
  queriesError,
  modifiedDefinitionsBySlotIndex,
  metricSlots,
  series: rawSeries,
  cardIdToEntityIndex,
  sourceColors,
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
}: MetricsViewerTabContentProps) {
  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab.dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        tab.projectionConfig,
        dimensionFilter,
      ),
    [
      definitions,
      tab.dimensionMapping,
      modifiedDefinitionsBySlotIndex,
      sourceColors,
      metricSlots,
      formulaEntities,
      tab.projectionConfig,
      dimensionFilter,
    ],
  );

  const definitionForControls = useMemo((): MetricDefinition | null => {
    for (const key of getObjectKeys(tab.dimensionMapping)) {
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
  }, [tab.dimensionMapping, modifiedDefinitionsBySlotIndex]);

  const allFilterDimensions = useMemo(() => {
    const filterDimensions: DimensionMetadata[] = [];
    for (const key of getObjectKeys(tab.dimensionMapping)) {
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
  }, [tab.dimensionMapping, modifiedDefinitionsBySlotIndex]);

  const updateProjectionConfig = useCallback(
    (updates: Partial<MetricsViewerTabProjectionConfig>) => {
      onTabUpdate({
        projectionConfig: { ...tab.projectionConfig, ...updates },
      });
    },
    [onTabUpdate, tab.projectionConfig],
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
      onTabUpdate({ display });
    },
    [onTabUpdate],
  );

  const handleVisualizationSettingsChange = useCallback(
    (updates: Partial<VisualizationSettings>) => {
      onTabUpdate({
        visualizationSettings: {
          ...tab.visualizationSettings,
          ...updates,
        },
      });
    },
    [onTabUpdate, tab.visualizationSettings],
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

  const showStackSeries =
    DISPLAY_TYPE_REGISTRY[tab.display].supportsStacking && rawSeries.length > 1;

  const isTimeTab = tab.type === "time";

  const tabConfig = getTabConfig(tab.type);
  const hasAnyOptions = dimensionItems.some((item) =>
    item.type === "expression"
      ? item.metricSources.some((s) => s.availableOptions.length > 0)
      : item.availableOptions.length > 0,
  );
  const hideDimensionPill = tabConfig.minDimensions === 0 && !hasAnyOptions;

  const mappedDimensionCount = getObjectValues(tab.dimensionMapping).filter(
    isNotNull,
  ).length;
  const dimensionRemoveHandler =
    mappedDimensionCount > 1 ? onDimensionRemove : undefined;

  return (
    <Stack flex="1 0 auto" gap={0}>
      <MetricsViewerVisualization
        rawSeries={rawSeries}
        onBrush={isTimeTab ? handleBrush : undefined}
        definitions={definitions}
        formulaEntities={formulaEntities}
        metricSlots={metricSlots}
        tab={tab}
        onTabUpdate={onTabUpdate}
        cardIdToEntityIndex={cardIdToEntityIndex}
        queriesAreLoading={queriesAreLoading}
        queriesError={queriesError}
      />
      {!hideDimensionPill && (
        <Box mt="sm">
          <DimensionPillBar
            items={dimensionItems}
            onDimensionChange={onDimensionChange}
            onDimensionRemove={dimensionRemoveHandler}
          />
        </Box>
      )}
      {definitionForControls && (
        <Flex mt="md" justify="center" align="center">
          <MetricControls
            definition={definitionForControls}
            displayType={tab.display}
            tabType={tab.type}
            dimensionFilter={tab.projectionConfig.dimensionFilter}
            allFilterDimensions={allFilterDimensions}
            onDisplayTypeChange={handleDisplayTypeChange}
            onDimensionFilterChange={handleDimensionFilterChange}
            onTemporalUnitChange={handleTemporalUnitChange}
            onBinningChange={handleBinningChange}
            showStackSeries={showStackSeries}
            visualizationSettings={tab.visualizationSettings}
            onVisualizationSettingsChange={handleVisualizationSettingsChange}
          />
        </Flex>
      )}
    </Stack>
  );
}
