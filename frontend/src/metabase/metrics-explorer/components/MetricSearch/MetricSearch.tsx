import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";

import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import type { ConcreteTableId, RecentItem } from "metabase-types/api";

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
  onSwapMetric?: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  rightSection?: ReactNode;
};

export function MetricSearch({
  selectedMetrics,
  metricColors,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
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

  const handleSwapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      if (onSwapMetric) {
        onSwapMetric(oldMetric, newMetric);
      } else {
        // Default behavior: remove old and add new
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
      recents={metricRecents}
      selectedMetricIds={selectedMetricIds}
      selectedMeasureIds={selectedMeasureIds}
      onAddMetric={onAddMetric}
      onRemoveMetric={onRemoveMetric}
      onSwapMetric={handleSwapMetric}
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
  const { results, isLoading, isSearching } = useMetricMeasureSearch(searchText);

  const filteredResults = useMemo(
    () =>
      (results ?? []).filter((r) =>
        r.model === "metric"
          ? !selectedMetricIds.has(r.id)
          : !selectedMeasureIds.has(r.id),
      ),
    [results, selectedMetricIds, selectedMeasureIds],
  );
  const filteredRecents = useMemo(
    () => recents.filter((r) => !selectedMetricIds.has(r.id)),
    [recents, selectedMetricIds],
  );

  const handleSelectResult = useCallback(
    (id: number, tableId?: ConcreteTableId) => {
      const result = results?.find((r) => r.id === id);
      if (result) {
        onSelect({
          id,
          name: result.name,
          sourceType: result.model as "metric" | "measure",
          tableId,
        });
      }
    },
    [results, onSelect],
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

  const activeList = useMemo(
    () => (isSearching ? filteredResults : filteredRecents),
    [isSearching, filteredResults, filteredRecents],
  );
  const handleEnter = useCallback(
    (item: (typeof activeList)[number]) => {
      if (isSearching) {
        const result = item as (typeof filteredResults)[number];
        handleSelectResult(
          result.id,
          result.model === "measure"
            ? (result.table_id as ConcreteTableId)
            : undefined,
        );
      } else {
        handleSelectFromRecents((item as (typeof filteredRecents)[number]).id);
      }
    },
    [isSearching, handleSelectResult, handleSelectFromRecents],
  );

  const { cursorIndex, getRef } = useListKeyboardNavigation({
    list: activeList,
    onEnter: handleEnter,
  });

  if (isSearching) {
    return (
      <MetricSearchResults
        results={filteredResults}
        isLoading={isLoading}
        cursorIndex={cursorIndex}
        getRef={getRef}
        onSelectResult={handleSelectResult}
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
      cursorIndex={cursorIndex}
      getRef={getRef}
      onSelect={handleSelectFromRecents}
    />
  );
}
