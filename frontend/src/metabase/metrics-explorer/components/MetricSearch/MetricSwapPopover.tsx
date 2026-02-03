import { useCallback, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Icon, Loader, Pill, Popover, TextInput } from "metabase/ui";
import type { ConcreteTableId, RecentItem } from "metabase-types/api";

import { useMetricMeasureSearch } from "../../hooks/use-metric-measure-search";

import { MetricRecentsList } from "./MetricRecentsList";
import { MetricResultItem } from "./MetricResultItem";
import S from "./MetricSwapPopover.module.css";
import type { SelectedMetric } from "./MetricSearchInput";

type MetricSwapPopoverProps = {
  metric: SelectedMetric;
  color?: string;
  recents: RecentItem[];
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSwap: (oldMetricId: number, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number) => void;
  onOpen?: () => void;
};

export function MetricSwapPopover({
  metric,
  color,
  recents,
  selectedMetricIds,
  selectedMeasureIds,
  onSwap,
  onRemove,
  onOpen,
}: MetricSwapPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const handleSelect = useCallback(
    (newMetric: SelectedMetric) => {
      onSwap(metric.id, newMetric);
      setIsOpen(false);
      setSearchText("");
    },
    [metric.id, onSwap],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
  }, []);

  const handleOpen = useCallback(() => {
    onOpen?.();
    setIsOpen(true);
  }, [onOpen]);

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-start"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <Pill
          className={S.metricPill}
          withRemoveButton
          onRemove={(e) => {
            e.stopPropagation();
            onRemove(metric.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
          removeButtonProps={{
            mr: 0,
            "aria-label": metric.isLoading
              ? t`Remove metric`
              : t`Remove ${metric.name}`,
          }}
        >
          <Flex align="center" gap="xs">
            {metric.isLoading ? (
              <Loader size="xs" />
            ) : (
              <>
                <Icon
                  name={metric.sourceType === "measure" ? "sum" : "metric"}
                  size={14}
                  c={color as Parameters<typeof Icon>[0]["c"]}
                />
                <span>{metric.name}</span>
              </>
            )}
          </Flex>
        </Pill>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <SwapDropdownContent
          searchText={searchText}
          onSearchChange={setSearchText}
          recents={recents}
          selectedMetricIds={selectedMetricIds}
          selectedMeasureIds={selectedMeasureIds}
          currentMetricId={metric.id}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type SwapDropdownContentProps = {
  searchText: string;
  onSearchChange: (text: string) => void;
  recents: RecentItem[];
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  currentMetricId: number;
  onSelect: (metric: SelectedMetric) => void;
  onClose: () => void;
};

function SwapDropdownContent({
  searchText,
  onSearchChange,
  recents,
  selectedMetricIds,
  selectedMeasureIds,
  currentMetricId,
  onSelect,
  onClose,
}: SwapDropdownContentProps) {
  const { results, isLoading, isSearching } = useMetricMeasureSearch(searchText);

  const filteredResults = (results ?? []).filter((r) =>
    r.model === "metric"
      ? !selectedMetricIds.has(r.id)
      : !selectedMeasureIds.has(r.id),
  );
  const filteredRecents = recents.filter(
    (r) => !selectedMetricIds.has(r.id) && r.id !== currentMetricId,
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <Box className={S.dropdown}>
      <Box p="sm" className={S.searchInputWrapper}>
        <TextInput
          placeholder={t`Search for metrics...`}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          size="sm"
        />
      </Box>
      <Box className={S.resultsContainer}>
        {isSearching ? (
          <SearchResults
            results={filteredResults}
            isLoading={isLoading}
            onSelectResult={handleSelectResult}
          />
        ) : filteredRecents.length > 0 ? (
          <MetricRecentsList
            recents={filteredRecents}
            onSelect={handleSelectFromRecents}
          />
        ) : null}
      </Box>
    </Box>
  );
}

type SearchResultsProps = {
  results: Array<{ id: number; name: string; model: string; table_name?: string | null; table_id?: number }>;
  isLoading: boolean;
  onSelectResult: (id: number, tableId?: ConcreteTableId) => void;
};

function SearchResults({
  results,
  isLoading,
  onSelectResult,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <Flex justify="center" align="center" p="lg">
        <Loader size="sm" />
      </Flex>
    );
  }

  if (results.length === 0) {
    return (
      <Box p="lg" ta="center" c="text-secondary">
        {t`No results found`}
      </Box>
    );
  }

  return (
    <Box p="sm">
      {results.map((item) => (
        <MetricResultItem
          key={`${item.model}-${item.id}`}
          name={item.name}
          slug={item.table_name ?? undefined}
          icon={item.model === "metric" ? "metric" : "sum"}
          onClick={() =>
            onSelectResult(
              item.id,
              item.model === "measure"
                ? (item.table_id as ConcreteTableId)
                : undefined,
            )
          }
        />
      ))}
    </Box>
  );
}
