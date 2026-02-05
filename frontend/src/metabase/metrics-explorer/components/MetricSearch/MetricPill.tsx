import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  dataStudioMetric,
  dataStudioPublishedTableMeasure,
} from "metabase/lib/urls/data-studio";
import {
  Box,
  Flex,
  Icon,
  Loader,
  Menu,
  Pill,
  Popover,
  TextInput,
} from "metabase/ui";
import type { ConcreteTableId, RecentItem } from "metabase-types/api";

import {
  type MetricOrMeasureResult,
  useMetricMeasureSearch,
} from "../../hooks/use-metric-measure-search";

import S from "./MetricPill.module.css";
import { MetricRecentsList } from "./MetricRecentsList";
import { MetricResultItem } from "./MetricResultItem";
import type { SelectedMetric } from "./MetricSearchInput";

type MetricPillProps = {
  metric: SelectedMetric;
  color?: string;
  recents: RecentItem[];
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSwap: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number) => void;
  onOpen?: () => void;
};

export function MetricPill({
  metric,
  color,
  recents,
  selectedMetricIds,
  selectedMeasureIds,
  onSwap,
  onRemove,
  onOpen,
}: MetricPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const handleSelect = useCallback(
    (newMetric: SelectedMetric) => {
      onSwap(metric, newMetric);
      setIsOpen(false);
      setSearchText("");
    },
    [metric, onSwap],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
  }, []);

  const handleOpen = useCallback(() => {
    onOpen?.();
    setContextMenuOpen(false);
    setIsOpen(true);
  }, [onOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    setSearchText("");
    setContextMenuOpen(true);
  }, []);

  const handleEditInDataStudio = useCallback(() => {
    const url =
      metric.sourceType === "measure"
        ? dataStudioPublishedTableMeasure(metric.tableId!, metric.id)
        : dataStudioMetric(metric.id);
    window.open(url, "_blank");
    setContextMenuOpen(false);
  }, [metric]);

  return (
    <Box component="span" pos="relative" display="inline-flex">
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
            onRemove={() => {
              onRemove(metric.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            onContextMenu={handleContextMenu}
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
      <Menu
        opened={contextMenuOpen}
        onChange={setContextMenuOpen}
        position="bottom-start"
        withinPortal
      >
        <Menu.Target>
          <Box
            component="span"
            pos="absolute"
            inset={0}
            style={{ pointerEvents: "none" }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            rightSection={<Icon name="external" />}
            onClick={handleEditInDataStudio}
          >
            {t`Edit in Data Studio`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
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
  const { results, isLoading, isSearching } =
    useMetricMeasureSearch(searchText);

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
  results: MetricOrMeasureResult[];
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
