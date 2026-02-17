import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { Box, Flex, TextInput } from "metabase/ui";

import { useMetricMeasureSearch } from "../../../hooks/use-metric-measure-search";
import type { SelectedMetric } from "../../../types/viewer-state";
import { MetricSearchResults } from "../MetricSearchResults";

import S from "./MetricSearchDropdown.module.css";

type ExcludeMetric = {
  id: number;
  sourceType: "metric" | "measure";
};

type MetricSearchDropdownProps = {
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSelect: (metric: SelectedMetric) => void;
  onClose?: () => void;
  excludeMetric?: ExcludeMetric;
  showSearchInput?: boolean;
  externalSearchText?: string;
};

export function MetricSearchDropdown({
  selectedMetricIds,
  selectedMeasureIds,
  onSelect,
  onClose,
  excludeMetric,
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
          (!excludeMetric ||
            r.id !== excludeMetric.id ||
            r.model !== excludeMetric.sourceType),
      ),
    [results, selectedMetricIds, selectedMeasureIds, excludeMetric],
  );

  const handleSelectResult = useCallback(
    (id: number, model: "metric" | "measure") => {
      const result = results?.find((r) => r.id === id && r.model === model);
      if (result) {
        onSelect({
          id,
          name: result.name,
          sourceType: result.model,
          tableId:
            result.model === "measure" && typeof result.table_id === "number"
              ? result.table_id
              : undefined,
        });
      }
    },
    [results, onSelect],
  );

  const handleEnter = useCallback(
    (item: (typeof filteredResults)[number]) => {
      handleSelectResult(item.id, item.model);
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
