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
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerTabProjectionConfig,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../../types/viewer-state";
import { getProjectionInfo } from "../../../utils/definition-builder";
import type { DimensionFilterValue } from "../../../utils/dimension-filters";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
} from "../../../utils/series";
import { getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type MetricsViewerTabContentProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  sourceColors: SourceColorMap;
  isExecuting: (id: MetricSourceId) => boolean;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove: (definitionId: MetricSourceId) => void;
};

export function MetricsViewerTabContent({
  definitions,
  tab,
  resultsByDefinitionId,
  errorsByDefinitionId,
  modifiedDefinitions,
  sourceColors,
  isExecuting,
  onTabUpdate,
  onDimensionChange,
  onDimensionRemove,
}: MetricsViewerTabContentProps) {
  const isLoading = useMemo(() => {
    return getObjectKeys(tab.dimensionMapping).some(isExecuting);
  }, [tab.dimensionMapping, isExecuting]);

  const { series: rawSeries, cardIdToDimensionId } = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab.dimensionMapping,
        tab.display,
        resultsByDefinitionId,
        modifiedDefinitions,
        sourceColors,
      ),
    [
      definitions,
      tab.dimensionMapping,
      tab.display,
      resultsByDefinitionId,
      modifiedDefinitions,
      sourceColors,
    ],
  );

  const firstError = useMemo(() => {
    for (const series of rawSeries) {
      const cols = series.data.cols;
      if (!cols.some((col) => isMetric(col))) {
        return t`Non-numeric metrics are not supported`;
      }
    }

    for (const sourceId of getObjectKeys(tab.dimensionMapping)) {
      const err = errorsByDefinitionId.get(sourceId);
      if (err) {
        return err;
      }
    }
    return null;
  }, [tab.dimensionMapping, errorsByDefinitionId, rawSeries]);

  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

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
      const entry = definitions.find((d) => d.id === sourceId);
      if (!entry) {
        continue;
      }

      const modDef = modifiedDefinitions.get(entry.id);
      if (!modDef) {
        continue;
      }

      const projs = LibMetric.projections(modDef);
      if (projs.length > 0) {
        return modDef;
      }
    }
    return null;
  }, [definitions, tab.dimensionMapping, modifiedDefinitions]);

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
