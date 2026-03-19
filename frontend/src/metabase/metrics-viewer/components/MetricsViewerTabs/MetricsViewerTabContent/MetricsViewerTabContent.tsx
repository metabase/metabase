import { useCallback, useMemo } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getObjectKeys, getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import { Flex, Stack } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, TemporalUnit } from "metabase-types/api";

import type {
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
import {
  buildArithmeticSeriesFromResult,
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
} from "../../../utils/series";
import { getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type ExpressionItemResult = {
  name: string;
  result: Dataset | null;
  isExecuting: boolean;
  error: string | null;
};

type MetricsViewerTabContentProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  tab: MetricsViewerTabState;
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
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
  onDimensionChange: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove: (definitionId: MetricSourceId) => void;
};

export function MetricsViewerTabContent({
  definitions,
  formulaEntities,
  tab,
  resultsByDefinitionId,
  errorsByDefinitionId,
  modifiedDefinitions,
  sourceColors,
  isExecuting,
  expressionItems = [],
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
}: MetricsViewerTabContentProps) {
  const metricSourceIds = useMemo(
    () => formulaEntities.filter(isMetricEntry).map((e) => e.id),
    [formulaEntities],
  );

  const isLoading = useMemo(() => {
    const expressionLoading = expressionItems.some((item) => item.isExecuting);
    const individualLoading = metricSourceIds.some((id) => isExecuting(id));
    return expressionLoading || individualLoading;
  }, [expressionItems, isExecuting, metricSourceIds]);

  const firstError = useMemo(() => {
    const expressionError =
      expressionItems.find((item) => item.error)?.error ?? null;
    if (expressionError) {
      return expressionError;
    }
    for (const id of metricSourceIds) {
      const err = errorsByDefinitionId.get(id);
      if (err) {
        return err;
      }
    }
    return null;
  }, [expressionItems, metricSourceIds, errorsByDefinitionId]);

  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

  const { series: rawSeries, cardIdToDimensionId } = useMemo(() => {
    // Build one arithmetic series per expression item that has a result.
    const expressionSeries = expressionItems.flatMap((item) =>
      item.result && item.name
        ? buildArithmeticSeriesFromResult(
            definitions,
            tab.dimensionMapping,
            tab.display,
            item.result,
            modifiedDefinitions,
            item.name,
          )
        : [],
    );

    // Build individual series for standalone metric items (or all in pure
    // individual mode when there are no expression items).
    const { series: individualSeries, cardIdToDimensionId } =
      buildRawSeriesFromDefinitions(
        formulaEntities.filter(isMetricEntry),
        tab.dimensionMapping,
        tab.display,
        resultsByDefinitionId,
        modifiedDefinitions,
        sourceColors,
        definitions,
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
    resultsByDefinitionId,
    modifiedDefinitions,
    sourceColors,
    definitions,
  ]);

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab.dimensionMapping,
        modifiedDefinitions,
        sourceColors,
        dimensionFilter,
      ),
    [
      definitions,
      tab.dimensionMapping,
      modifiedDefinitions,
      sourceColors,
      dimensionFilter,
    ],
  );

  const definitionForControls = useMemo((): MetricDefinition | null => {
    for (const sourceId of getObjectKeys(tab.dimensionMapping)) {
      const modDef = modifiedDefinitions.get(sourceId);
      if (!modDef) {
        continue;
      }

      const projs = LibMetric.projections(modDef);
      if (projs.length > 0) {
        return modDef;
      }
    }
    return null;
  }, [tab.dimensionMapping, modifiedDefinitions]);

  const allFilterDimensions = useMemo(() => {
    const filterDimensions: DimensionMetadata[] = [];
    for (const sourceId of getObjectKeys(tab.dimensionMapping)) {
      const modDef = modifiedDefinitions.get(sourceId);
      if (!modDef) {
        continue;
      }
      const projInfo = getProjectionInfo(modDef);
      if (projInfo.filterDimension) {
        filterDimensions.push(projInfo.filterDimension);
      }
    }
    return filterDimensions;
  }, [tab.dimensionMapping, modifiedDefinitions]);

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
    return <LoadingAndErrorWrapper loading={isLoading} error={firstError} />;
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
