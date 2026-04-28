import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import { Box, Flex, TextInput } from "metabase/ui";

import {
  type MetricOrMeasureResult,
  useMetricMeasureSearch,
} from "../../../hooks/use-metric-measure-search";
import type { SelectedMetric } from "../../../types/viewer-state";
import { createSourceId } from "../../../utils/source-ids";
import { MetricSearchResults } from "../MetricSearchResults";
import {
  type ExcludeMetric,
  type MetricNameMap,
  filterSearchResults,
} from "../utils";

import S from "./MetricSearchDropdown.module.css";

type MetricSearchDropdownProps = {
  selectedMetricIds?: Set<number>;
  selectedMeasureIds?: Set<number>;
  onSelect: (metric: SelectedMetric) => void;
  onClose?: () => void;
  excludeMetric?: ExcludeMetric;
  showSearchInput?: boolean;
  externalSearchText?: string;
  onHasSelectionChange?: (hasSelection: boolean) => void;
  setSearchMetricNames?: Dispatch<SetStateAction<MetricNameMap>>;
};

export function MetricSearchDropdown({
  selectedMetricIds,
  selectedMeasureIds,
  onSelect,
  onClose,
  excludeMetric,
  showSearchInput = false,
  externalSearchText,
  onHasSelectionChange,
  setSearchMetricNames,
}: MetricSearchDropdownProps) {
  const [internalSearchText, setInternalSearchText] = useState("");
  const searchText = showSearchInput
    ? internalSearchText
    : (externalSearchText ?? "");

  const { results, isLoading } = useMetricMeasureSearch(searchText);

  const filteredResults = useMemo(
    () =>
      filterSearchResults(
        results,
        selectedMetricIds,
        selectedMeasureIds,
        excludeMetric,
      ),
    [results, selectedMetricIds, selectedMeasureIds, excludeMetric],
  );

  useEffect(() => {
    setSearchMetricNames?.((prev) => ({
      ...prev,
      ...Object.fromEntries(
        filteredResults.map((result) => [
          createSourceId(result.id, result.model),
          result.name,
        ]),
      ),
    }));
  }, [filteredResults, setSearchMetricNames]);

  useUnmount(() => {
    setSearchMetricNames?.({});
  });

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

  const { cursorIndex, getRef } = useListKeyboardNavigation<
    MetricOrMeasureResult,
    HTMLDivElement
  >({
    list: filteredResults,
    onEnter: handleEnter,
  });

  useEffect(() => {
    onHasSelectionChange?.(cursorIndex != null);
  }, [cursorIndex, onHasSelectionChange]);

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
        w="22rem"
        mah="25rem"
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
