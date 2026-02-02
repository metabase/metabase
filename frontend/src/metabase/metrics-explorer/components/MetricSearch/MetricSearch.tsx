import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import type { CardId, ConcreteTableId, MeasureId, RecentItem } from "metabase-types/api";

import { useMetricMeasureSearch } from "../../hooks/use-metric-measure-search";
import { useMetricRecents } from "../../hooks/use-metric-recents";

import { MetricRecentsList } from "./MetricRecentsList";
import type { SelectedMetric } from "./MetricSearchInput";
import { MetricSearchInput } from "./MetricSearchInput";
import { MetricSearchResults } from "./MetricSearchResults";

type MetricSearchProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: Record<number, string>;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number) => void;
  rightSection?: ReactNode;
};

export function MetricSearch({
  selectedMetrics,
  metricColors,
  onAddMetric,
  onRemoveMetric,
  rightSection,
}: MetricSearchProps) {
  const { metricRecents } = useMetricRecents();
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
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      rightSection={rightSection}
    >
      {({ searchText, onSelect }) => {
        const filteredRecents = metricRecents.filter(
          (r) => !selectedMetricIds.has(r.id),
        );
        const showDropdown = searchText.length > 0 || filteredRecents.length > 0;
        if (!showDropdown) {
          return null;
        }
        return (
          <SearchDropdownContent
            searchText={searchText}
            recents={metricRecents}
            selectedMetricIds={selectedMetricIds}
            selectedMeasureIds={selectedMeasureIds}
            onSelect={onSelect}
          />
        );
      }}
    </MetricSearchInput>
  );
}

type SearchDropdownContentProps = {
  searchText: string;
  recents: RecentItem[];
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSelect: (metric: SelectedMetric) => void;
};

function SearchDropdownContent({
  searchText,
  recents,
  selectedMetricIds,
  selectedMeasureIds,
  onSelect,
}: SearchDropdownContentProps) {
  const { metricResults, measureResults, isLoading, isSearching } =
    useMetricMeasureSearch(searchText);

  const filteredMetricResults = (metricResults ?? []).filter(
    (r) => !selectedMetricIds.has(r.id),
  );
  const filteredMeasureResults = (measureResults ?? []).filter(
    (r) => !selectedMeasureIds.has(r.id),
  );
  const filteredRecents = recents.filter((r) => !selectedMetricIds.has(r.id));

  const handleSelectMetric = useCallback(
    (metricId: CardId) => {
      const metric = metricResults.find((r) => r.id === metricId);
      if (metric) {
        onSelect({ id: metricId, name: metric.name, sourceType: "metric" });
      }
    },
    [metricResults, onSelect],
  );

  const handleSelectMeasure = useCallback(
    (measureId: MeasureId, tableId: ConcreteTableId) => {
      const measure = measureResults.find((r) => r.id === measureId);
      if (measure) {
        onSelect({
          id: measureId,
          name: measure.name,
          sourceType: "measure",
          tableId,
        });
      }
    },
    [measureResults, onSelect],
  );

  const handleSelectFromRecents = useCallback(
    (metricId: number) => {
      const metric = recents.find((r) => r.id === metricId);
      if (metric) {
        onSelect({ id: metricId, name: metric.name, sourceType: "metric" });
      }
    },
    [recents, onSelect],
  );

  if (isSearching) {
    return (
      <MetricSearchResults
        metricResults={filteredMetricResults}
        measureResults={filteredMeasureResults}
        isLoading={isLoading}
        onSelectMetric={handleSelectMetric}
        onSelectMeasure={handleSelectMeasure}
      />
    );
  }

  // Don't show empty recents popover
  if (filteredRecents.length === 0) {
    return null;
  }

  return (
    <MetricRecentsList
      recents={filteredRecents}
      onSelect={handleSelectFromRecents}
    />
  );
}
