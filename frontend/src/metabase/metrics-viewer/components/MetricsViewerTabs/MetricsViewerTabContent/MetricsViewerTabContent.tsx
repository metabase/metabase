import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getObjectKeys, getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import { Center, Flex, Stack } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type { Dataset, TemporalUnit } from "metabase-types/api";

import type {
  ExpressionItemResult,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerFormulaEntity,
  MetricsViewerTabProjectionConfig,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../../types/viewer-state";
import { isMetricEntry } from "../../../types/viewer-state";
import { getProjectionInfo } from "../../../utils/definition-builder";
import type { DimensionFilterValue } from "../../../utils/dimension-filters";
import { computeMetricSlots } from "../../../utils/metric-slots";
import {
  buildArithmeticSeriesFromResult,
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
  computeUniqueEntityNames,
} from "../../../utils/series";
import { getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type MetricsViewerTabContentProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  tab: MetricsViewerTabState;
  resultsByEntityIndex: Map<number, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitionsByIndex: Map<number, MetricDefinition>;
  sourceColors: SourceColorMap;
  isExecuting: (id: MetricSourceId) => boolean;
  /**
   * One entry per expression item (items with operators). Empty in pure
   * individual-metric mode.
   */
  expressionItems?: ExpressionItemResult[];
  /**
   * Source IDs that are plain single-metric items. `null` = pure individual
   * mode (all definitions are standalone).
   */
  standaloneSourceIds?: Set<MetricSourceId> | null;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onDimensionRemove: (slotIndex: number) => void;
};

export function MetricsViewerTabContent({
  definitions,
  formulaEntities,
  tab,
  resultsByEntityIndex,
  errorsByDefinitionId,
  modifiedDefinitionsByIndex,
  sourceColors,
  isExecuting,
  expressionItems = [],
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
}: MetricsViewerTabContentProps) {
  const metricSlots = useMemo(
    () => computeMetricSlots(formulaEntities),
    [formulaEntities],
  );

  const metricSourceIds = useMemo(
    () => formulaEntities.filter(isMetricEntry).map((e) => e.id),
    [formulaEntities],
  );

  const uniqueNames = useMemo(
    () => computeUniqueEntityNames(formulaEntities, definitions),
    [formulaEntities, definitions],
  );

  const { series: rawSeries, cardIdToDimensionId } = useMemo(() => {
    // Build one arithmetic series per expression item that has a result.
    const expressionSeries = expressionItems.flatMap((item) => {
      if (!item.result || !item.entry.name) {
        return [];
      }

      // TODO: instead of this we should have a single cycle that iterates over "formulaEntities" and creates a series for a specific entity rather than metrics and expressions separately
      const itemIndex = formulaEntities.findIndex(
        (entity) =>
          entity.type === "expression" && entity.name === item.entry.name,
      );

      return buildArithmeticSeriesFromResult(
        item.entry,
        itemIndex,
        metricSlots,
        definitions,
        tab.dimensionMapping,
        tab.display,
        item.result,
        item.modifiedDefinitions,
        sourceColors[itemIndex],
      );
    });

    // Build individual series for standalone metric items (or all in pure
    // individual mode when there are no expression items).
    const indexedMetrics = formulaEntities
      .map((e, i) => ({ entry: e, entityIndex: i }))
      .filter(
        (item): item is { entry: MetricDefinitionEntry; entityIndex: number } =>
          isMetricEntry(item.entry),
      );

    const totalEntityCount = indexedMetrics.length + expressionSeries.length;

    const { series: individualSeries, cardIdToDimensionId } =
      buildRawSeriesFromDefinitions(
        indexedMetrics,
        tab.dimensionMapping,
        tab.display,
        resultsByEntityIndex,
        modifiedDefinitionsByIndex,
        sourceColors,
        definitions,
        uniqueNames,
        totalEntityCount,
        metricSlots,
      );

    return {
      series: [...expressionSeries, ...individualSeries],
      cardIdToDimensionId,
    };
  }, [
    expressionItems,
    formulaEntities,
    tab.dimensionMapping,
    tab.display,
    resultsByEntityIndex,
    modifiedDefinitionsByIndex,
    sourceColors,
    definitions,
    uniqueNames,
    metricSlots,
  ]);

  const isLoading = useMemo(() => {
    const expressionLoading = expressionItems.some((item) => item.isExecuting);
    const individualLoading = metricSourceIds.some((id) => isExecuting(id));
    return expressionLoading || individualLoading;
  }, [expressionItems, isExecuting, metricSourceIds]);

  const firstError = useMemo(() => {
    for (const series of rawSeries) {
      const cols = series.data.cols;
      if (!cols.some((col) => isMetric(col))) {
        return t`Non-numeric metrics are not supported`;
      }
    }
    for (const id of metricSourceIds) {
      const err = errorsByDefinitionId.get(id);
      if (err) {
        return err;
      }
    }
    for (const item of expressionItems) {
      if (item.requestError) {
        return item.requestError;
      }
    }
    for (const item of expressionItems) {
      // we always show request errors, but we only show expression errors if we have no other data to show
      if (!isLoading && rawSeries.length === 0 && item.expressionError) {
        return item.expressionError;
      }
    }
    return null;
  }, [
    expressionItems,
    metricSourceIds,
    errorsByDefinitionId,
    isLoading,
    rawSeries,
  ]);

  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab.dimensionMapping,
        modifiedDefinitionsByIndex,
        sourceColors,
        metricSlots,
        formulaEntities,
        tab.projectionConfig,
        dimensionFilter,
      ),
    [
      definitions,
      tab.dimensionMapping,
      modifiedDefinitionsByIndex,
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
      const slot = metricSlots[slotIndex];
      if (!slot) {
        continue;
      }

      let modDef: MetricDefinition | undefined;
      if (slot.tokenPosition === undefined) {
        // Standalone metric slot
        modDef = modifiedDefinitionsByIndex.get(slot.entityIndex);
      } else {
        // Expression token slot — look up from the expression item
        const exprItem = expressionItems.find(
          (item) => item.entry === formulaEntities[slot.entityIndex],
        );
        modDef = exprItem?.modifiedDefinitions[slot.tokenPosition];
      }

      if (!modDef) {
        continue;
      }

      const projs = LibMetric.projections(modDef);
      if (projs.length > 0) {
        return modDef;
      }
    }
    return null;
  }, [
    tab.dimensionMapping,
    modifiedDefinitionsByIndex,
    metricSlots,
    expressionItems,
    formulaEntities,
  ]);

  const allFilterDimensions = useMemo(() => {
    const filterDimensions: DimensionMetadata[] = [];
    for (const key of getObjectKeys(tab.dimensionMapping)) {
      const slotIndex = Number(key);
      const slot = metricSlots[slotIndex];
      if (!slot) {
        continue;
      }

      let modDef: MetricDefinition | undefined;
      if (slot.tokenPosition === undefined) {
        modDef = modifiedDefinitionsByIndex.get(slot.entityIndex);
      } else {
        const exprItem = expressionItems.find(
          (item) => item.entry === formulaEntities[slot.entityIndex],
        );
        modDef = exprItem?.modifiedDefinitions[slot.tokenPosition];
      }

      if (!modDef) {
        continue;
      }
      const projInfo = getProjectionInfo(modDef);
      if (projInfo.filterDimension) {
        filterDimensions.push(projInfo.filterDimension);
      }
    }
    return filterDimensions;
  }, [
    tab.dimensionMapping,
    modifiedDefinitionsByIndex,
    metricSlots,
    expressionItems,
    formulaEntities,
  ]);

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

  const isTimeTab = tab.type === "time";
  const mappedDimensionCount = getObjectValues(tab.dimensionMapping).filter(
    isNotNull,
  ).length;
  const dimensionRemoveHandler =
    mappedDimensionCount > 1 ? onDimensionRemove : undefined;

  if (isLoading || firstError) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={firstError} />
      </Center>
    );
  }

  if (rawSeries.length === 0) {
    return null;
  }

  return (
    <Stack flex="1 0 auto" gap="md">
      <MetricsViewerVisualization
        rawSeries={rawSeries}
        dimensionItems={dimensionItems}
        onDimensionChange={onDimensionChange}
        onDimensionRemove={dimensionRemoveHandler}
        onBrush={isTimeTab ? handleBrush : undefined}
        definitions={definitions}
        metricSlots={metricSlots}
        tab={tab}
        onTabUpdate={onTabUpdate}
        cardIdToDimensionId={cardIdToDimensionId}
      />
      {definitionForControls && (
        <Flex justify="center" align="center">
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
          />
        </Flex>
      )}
    </Stack>
  );
}
