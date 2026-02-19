import { useMemo } from "react";

import type { ProjectionClause } from "metabase-lib/metric";

import type {
  MetricSourceId,
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
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearch({
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
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

  return (
    <MetricSearchInput
      selectedMetrics={selectedMetrics}
      metricColors={metricColors}
      definitions={definitions}
      selectedMetricIds={selectedMetricIds}
      selectedMeasureIds={selectedMeasureIds}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={onSwapMetric}
      onSetBreakout={onSetBreakout}
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
