import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import type { DimensionOption } from "metabase/common/components/DimensionPill";

import type { BreakoutSeriesColor } from "../../utils/series";
import type { SelectedMetric, SourceColorMap } from "../../types/viewer-state";

import { MetricSearchDropdown } from "./MetricSearchDropdown";
import { MetricSearchInput } from "./MetricSearchInput";

type MetricSearchProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number) => void;
  onSwapMetric?: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  rightSection?: ReactNode;
  breakoutColorsByMetricId?: Map<number, BreakoutSeriesColor[]>;
  breakoutOptionsByMetricId?: Map<number, DimensionOption[]>;
  activeBreakoutByMetricId?: Map<number, string>;
  onBreakout?: (metricId: number, dimensionName: string | null) => void;
};

export function MetricSearch({
  selectedMetrics,
  metricColors,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  rightSection,
  breakoutColorsByMetricId,
  breakoutOptionsByMetricId,
  activeBreakoutByMetricId,
  onBreakout,
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
        onRemoveMetric(oldMetric.id);
        onAddMetric(newMetric);
      }
    },
    [onSwapMetric, onRemoveMetric, onAddMetric],
  );

  return (
    <MetricSearchInput
      selectedMetrics={selectedMetrics}
      metricColors={metricColors}
      selectedMetricIds={selectedMetricIds}
      selectedMeasureIds={selectedMeasureIds}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={handleSwapMetric}
      rightSection={rightSection}
      breakoutColorsByMetricId={breakoutColorsByMetricId}
      breakoutOptionsByMetricId={breakoutOptionsByMetricId}
      activeBreakoutByMetricId={activeBreakoutByMetricId}
      onBreakout={onBreakout}
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
