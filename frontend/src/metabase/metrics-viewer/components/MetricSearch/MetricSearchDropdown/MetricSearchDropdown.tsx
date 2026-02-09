import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { Box, Flex, TextInput } from "metabase/ui";
import type { ConcreteTableId } from "metabase-types/api";

import { useMetricMeasureSearch } from "../../../hooks/use-metric-measure-search";
import type { SelectedMetric } from "../../../types/viewer-state";
import { MetricSearchResults } from "../MetricSearchResults";

import S from "./MetricSearchDropdown.module.css";

type MetricSearchDropdownProps = {
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSelect: (metric: SelectedMetric) => void;
  onClose?: () => void;
  excludeMetricId?: number;
  showSearchInput?: boolean;
  externalSearchText?: string;
};

export function MetricSearchDropdown({
  selectedMetricIds,
  selectedMeasureIds,
  onSelect,
  onClose,
  excludeMetricId,
  showSearchInput = false,
  externalSearchText,
}: MetricSearchDropdownProps) {
  const [internalSearchText, setInternalSearchText] = useState("");
  const searchText = showSearchInput
    ? internalSearchText
    : (externalSearchText ?? "");

  const { results, isLoading } = useMetricMeasureSearch(searchText);

  const filteredResults = useMemo(
    () =>
      results.filter(
        (r) =>
          (r.model === "metric"
            ? !selectedMetricIds.has(r.id)
            : !selectedMeasureIds.has(r.id)) &&
          (excludeMetricId === undefined || r.id !== excludeMetricId),
      ),
    [results, selectedMetricIds, selectedMeasureIds, excludeMetricId],
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

  const handleEnter = useCallback(
    (item: (typeof filteredResults)[number]) => {
      handleSelectResult(
        item.id,
        item.model === "measure"
          ? (item.table_id as ConcreteTableId)
          : undefined,
      );
    },
    [handleSelectResult],
  );

  const { cursorIndex, getRef } = useListKeyboardNavigation({
    list: filteredResults,
    onEnter: handleEnter,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    },
    [onClose],
  );

  if (showSearchInput) {
    return (
      <Flex
        direction="column"
        miw={300}
        maw={400}
        mah={400}
        onClick={(e) => e.stopPropagation()}
      >
        <Box p="sm" className={S.searchInputWrapper}>
          <TextInput
            placeholder={t`Search for metrics...`}
            value={internalSearchText}
            onChange={(e) => setInternalSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </Box>
        <Box flex={1} className={S.resultsContainer}>
          <MetricSearchResults
            results={filteredResults}
            isLoading={isLoading}
            cursorIndex={cursorIndex}
            getRef={getRef}
            onSelectResult={handleSelectResult}
          />
        </Box>
      </Flex>
    );
  }

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
