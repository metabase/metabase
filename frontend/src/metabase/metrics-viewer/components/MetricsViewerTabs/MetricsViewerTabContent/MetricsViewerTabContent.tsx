import { useCallback, useMemo } from "react";

import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { DatePickerValue, SpecificDatePickerValue } from "metabase/querying/common/types";
import { Flex, Stack } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, TemporalUnit } from "metabase-types/api";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerTabState,
  SourceColorMap,
} from "../../../types/viewer-state";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
  computeModifiedDefinitions,
} from "../../../utils/series";
import { getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type MetricsViewerTabContentProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  resultsByDefinitionId: Map<DefinitionId, Dataset>;
  errorsByDefinitionId: Map<DefinitionId, string>;
  sourceColors: SourceColorMap;
  isExecuting: (id: DefinitionId) => boolean;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  onDimensionChange: (
    definitionId: DefinitionId,
    dimensionId: string,
  ) => void;
};

export function MetricsViewerTabContent({
  definitions,
  tab,
  resultsByDefinitionId,
  errorsByDefinitionId,
  sourceColors,
  isExecuting,
  onTabUpdate,
  onDimensionChange,
}: MetricsViewerTabContentProps) {
  const isLoading = useMemo(() => {
    return tab.definitions.some((td) => isExecuting(td.definitionId));
  }, [tab.definitions, isExecuting]);

  const firstError = useMemo(() => {
    for (const td of tab.definitions) {
      const err = errorsByDefinitionId.get(td.definitionId);
      if (err) {
        return err;
      }
    }
    return null;
  }, [tab.definitions, errorsByDefinitionId]);

  const dimensionFilter = getTabConfig(tab.type).dimensionPredicate;

  const modifiedDefinitions = useMemo(
    () => computeModifiedDefinitions(definitions, tab),
    [definitions, tab],
  );

  const { series: rawSeries } = useMemo(
    () => buildRawSeriesFromDefinitions(definitions, tab, resultsByDefinitionId, modifiedDefinitions),
    [definitions, tab, resultsByDefinitionId, modifiedDefinitions],
  );

  const dimensionItems = useMemo(
    () => buildDimensionItemsFromDefinitions(definitions, tab, modifiedDefinitions, sourceColors, dimensionFilter),
    [definitions, tab, modifiedDefinitions, sourceColors, dimensionFilter],
  );

  const definitionForControls = useMemo((): MetricDefinition | null => {
    for (const td of tab.definitions) {
      const entry = definitions.find((d) => d.id === td.definitionId);
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
  }, [definitions, tab.definitions, modifiedDefinitions]);

  const handleDimensionChange = useCallback(
    (itemId: string | number, optionName: string) => {
      onDimensionChange(String(itemId) as DefinitionId, optionName);
    },
    [onDimensionChange],
  );

  const handleFilterChange = useCallback(
    (value: DatePickerValue | undefined) => {
      onTabUpdate({ filter: value });
    },
    [onTabUpdate],
  );

  const handleTemporalUnitChange = useCallback(
    (unit: TemporalUnit | undefined) => {
      onTabUpdate({ projectionTemporalUnit: unit });
    },
    [onTabUpdate],
  );

  const handleBinningChange = useCallback(
    (binningStrategy: string | null) => {
      onTabUpdate({ binningStrategy });
    },
    [onTabUpdate],
  );

  const handleDisplayTypeChange = useCallback(
    (display: MetricsViewerDisplayType) => {
      onTabUpdate({ display });
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
      onTabUpdate({ filter: filterValue });
    },
    [onTabUpdate],
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
      />
      {definitionForControls && tab.type !== "geo" && (
        <Flex justify="center">
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
        </Flex>
      )}
    </Stack>
  );
}
