import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import type { DimensionMetadata } from "metabase-lib/metric";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../types/viewer-state";

import { MetricSearchDropdown } from "./MetricSearchDropdown";
import { MetricSearchInput } from "./MetricSearchInput";

type MetricSearchProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  definitions: MetricsViewerDefinitionEntry[];
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric?: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (id: DefinitionId, dimension: DimensionMetadata | undefined) => void;
  rightSection?: ReactNode;
};

export function MetricSearch({
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
  rightSection,
}: MetricSearchProps) {
  const selectedMetricIds = useMemo(
    () =>
      new Set(
        selectedMetrics
          .filter((m) => m.sourceType === "metric")
          .map((m) => m.id),
      ),
    [selectedMetrics],
  );
  const selectedMeasureIds = useMemo(
    () =>
      new Set(
        selectedMetrics
          .filter((m) => m.sourceType === "measure")
          .map((m) => m.id),
      ),
    [selectedMetrics],
  );

  const handleSwapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      if (onSwapMetric) {
        onSwapMetric(oldMetric, newMetric);
      } else {
        onRemoveMetric(oldMetric.id, oldMetric.sourceType);
        onAddMetric(newMetric);
      }
    },
    [onSwapMetric, onRemoveMetric, onAddMetric],
  );

  return (
    <MetricSearchInput
      selectedMetrics={selectedMetrics}
      metricColors={metricColors}
      definitions={definitions}
      selectedMetricIds={selectedMetricIds}
      selectedMeasureIds={selectedMeasureIds}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={handleSwapMetric}
      onSetBreakout={onSetBreakout}
      rightSection={rightSection}
    >
      {({ searchText, onSelect }) => (
        <MetricSearchDropdown
          selectedMetricIds={selectedMetricIds}
          selectedMeasureIds={selectedMeasureIds}
          onSelect={onSelect}
          externalSearchText={searchText}
        />
      )}
    </MetricSearchInput>
  );
}
