import { useCallback, useMemo } from "react";

import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getObjectKeys } from "metabase/lib/objects";
import type {
  DatePickerValue,
  SpecificDatePickerValue,
} from "metabase/querying/common/types";
import { Box, Flex, Stack } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, TemporalUnit } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerTabLayoutState,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../../types/viewer-state";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
} from "../../../utils/series";
import { DISPLAY_TYPE_REGISTRY, getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricLayoutControl } from "../../MetricLayoutControl";
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
}: MetricsViewerTabContentProps) {
  const isLoading = useMemo(() => {
    return getObjectKeys(tab.dimensionMapping).some(isExecuting);
  }, [tab.dimensionMapping, isExecuting]);

  const firstError = useMemo(() => {
    for (const sourceId of getObjectKeys(tab.dimensionMapping)) {
      const err = errorsByDefinitionId.get(sourceId);
      if (err) {
        return err;
      }
    }
    return null;
  }, [tab.dimensionMapping, errorsByDefinitionId]);

  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

  const rawSeries = useMemo(
    () =>
      buildRawSeriesFromDefinitions(
        definitions,
        tab,
        resultsByDefinitionId,
        modifiedDefinitions,
        sourceColors,
      ),
    [
      definitions,
      tab,
      resultsByDefinitionId,
      modifiedDefinitions,
      sourceColors,
    ],
  );

  const dimensionItems = useMemo(
    () =>
      buildDimensionItemsFromDefinitions(
        definitions,
        tab,
        modifiedDefinitions,
        sourceColors,
        dimensionFilter,
      ),
    [definitions, tab, modifiedDefinitions, sourceColors, dimensionFilter],
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

  const handleDimensionChange = useCallback(
    (itemId: string | number, dimension: DimensionMetadata) => {
      onDimensionChange(itemId as MetricSourceId, dimension);
    },
    [onDimensionChange],
  );

  const handleFilterChange = useCallback(
    (value: DatePickerValue | undefined) => {
      onTabUpdate({
        projectionConfig: { ...tab.projectionConfig, filter: value },
      });
    },
    [onTabUpdate, tab.projectionConfig],
  );

  const handleTemporalUnitChange = useCallback(
    (unit: TemporalUnit | undefined) => {
      onTabUpdate({
        projectionConfig: { ...tab.projectionConfig, temporalUnit: unit },
      });
    },
    [onTabUpdate, tab.projectionConfig],
  );

  const handleBinningChange = useCallback(
    (binningStrategy: string | undefined) => {
      onTabUpdate({
        projectionConfig: { ...tab.projectionConfig, binningStrategy },
      });
    },
    [onTabUpdate, tab.projectionConfig],
  );

  const handleDisplayTypeChange = useCallback(
    (display: MetricsViewerDisplayType) => {
      const { supportsMultipleSeries } = DISPLAY_TYPE_REGISTRY[display];
      const layout = {
        split: supportsMultipleSeries === false ? true : tab.layout.split,
        spacing: tab.layout.spacing,
      };
      onTabUpdate({ display, layout });
    },
    [onTabUpdate, tab],
  );

  const handleLayoutChange = useCallback(
    (layout: MetricsViewerTabLayoutState) => {
      onTabUpdate({ layout });
    },
    [onTabUpdate],
  );

  const handleBrush = useCallback(
    ({ start, end }: { start: number; end: number }) => {
      const filterValue: SpecificDatePickerValue = {
        type: "specific",
        operator: "between",
        values: [new Date(start), new Date(end)],
        hasTime: true,
      };
      onTabUpdate({
        projectionConfig: { ...tab.projectionConfig, filter: filterValue },
      });
    },
    [onTabUpdate, tab.projectionConfig],
  );

  const showTimeControls = tab.type === "time";

  if (isLoading || firstError) {
    return <LoadingAndErrorWrapper loading={isLoading} error={firstError} />;
  }

  if (rawSeries.length === 0 && dimensionItems.length > 0) {
    return (
      <Stack flex="1 0 auto" gap="sm">
        <DimensionPillBar
          items={dimensionItems}
          onDimensionChange={handleDimensionChange}
        />
      </Stack>
    );
  }

  if (rawSeries.length === 0) {
    return null;
  }

  return (
    <Stack flex="1 0 auto" gap="sm">
      <MetricsViewerVisualization
        rawSeries={rawSeries}
        dimensionItems={dimensionItems}
        onDimensionChange={handleDimensionChange}
        onBrush={showTimeControls ? handleBrush : undefined}
        layout={tab.layout}
      />
      {definitionForControls && (
        <Flex justify="space-between" align="center">
          <Box />
          <MetricControls
            definition={definitionForControls}
            displayType={tab.display}
            tabType={tab.type}
            showTimeControls={showTimeControls}
            onDisplayTypeChange={handleDisplayTypeChange}
            onFilterChange={handleFilterChange}
            onTemporalUnitChange={handleTemporalUnitChange}
            onBinningChange={handleBinningChange}
          />
          <MetricLayoutControl
            displayType={tab.display}
            value={tab.layout}
            onChange={handleLayoutChange}
          />
        </Flex>
      )}
    </Stack>
  );
}
