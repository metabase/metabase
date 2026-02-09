import { useCallback, useMemo } from "react";

import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { DatePickerValue, SpecificDatePickerValue } from "metabase/querying/common/types";
import { Flex, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Dataset, TemporalUnit } from "metabase-types/api";

import { STAGE_INDEX } from "../../../constants";
import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerTabState,
} from "../../../types/viewer-state";
import {
  buildDimensionItemsFromDefinitions,
  buildRawSeriesFromDefinitions,
  computeModifiedQueries,
} from "../../../utils/series";
import { getTabConfig } from "../../../utils/tab-config";
import { MetricControls } from "../../MetricControls";
import { MetricsViewerVisualization } from "../../MetricsViewerVisualization";

type MetricsViewerTabContentProps = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  resultsByDefinitionId: Map<DefinitionId, Dataset>;
  errorsByDefinitionId: Map<DefinitionId, string>;
  sourceColors: Record<number, string>;
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

  const columnFilter = getTabConfig(tab.type).columnPredicate;

  const modifiedQueries = useMemo(
    () => computeModifiedQueries(definitions, tab),
    [definitions, tab],
  );

  const rawSeries = useMemo(
    () => buildRawSeriesFromDefinitions(definitions, tab, resultsByDefinitionId, modifiedQueries),
    [definitions, tab, resultsByDefinitionId, modifiedQueries],
  );

  const dimensionItems = useMemo(
    () => buildDimensionItemsFromDefinitions(definitions, tab, modifiedQueries, sourceColors, columnFilter),
    [definitions, tab, modifiedQueries, sourceColors, columnFilter],
  );

  const queryForControls = useMemo((): Lib.Query | null => {
    for (const td of tab.definitions) {
      const entry = definitions.find((d) => d.id === td.definitionId);
      if (!entry) {
        continue;
      }

      const query = modifiedQueries.get(entry.id);
      if (!query) {
        continue;
      }

      const breakouts = Lib.breakouts(query, STAGE_INDEX);
      if (breakouts.length > 0) {
        return query;
      }
    }
    return null;
  }, [definitions, tab.definitions, modifiedQueries]);

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
      {queryForControls && tab.type !== "geo" && (
        <Flex justify="center">
          <MetricControls
            query={queryForControls}
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
