import { useCallback, useMemo } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import type { FilterItem } from "metabase/querying/filters/components/FilterPanel/types";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { displayInfo } from "metabase-lib/metadata";
import type { ClauseDisplayInfo, Filterable, Query } from "metabase-lib/types";

import { useFilterHandlers } from "./use-filter-handlers";

type FilterItemWithDisplay = FilterItem & ClauseDisplayInfo;

export interface SDKFilterItem extends FilterItemWithDisplay {
  onRemoveFilter: () => void;
  onUpdateFilter: (nextFilterClause: Filterable) => void;
  filterIndex: number;
}

export const useFilterData = (): SDKFilterItem[] => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  const query = question?.query();
  const stageIndex = -1;
  const onQueryChange = useCallback(
    (newQuery: Query) => {
      if (question) {
        updateQuestion(question.setQuery(newQuery), { run: true });
      }
    },
    [question, updateQuestion],
  );

  const {
    onRemoveFilter: handleRemoveFilter,
    onUpdateFilter: handleUpdateFilter,
  } = useFilterHandlers({
    query,
    stageIndex,
    onQueryChange,
  });

  const filters = useMemo(
    () =>
      query
        ? getFilterItems(query).map((filterItem) => ({
            ...filterItem,
            ...displayInfo(query, filterItem.stageIndex, filterItem.filter),
          }))
        : [],

    [query],
  );

  return filters.map((filterItem, filterIndex) => {
    const onRemoveFilter = () => handleRemoveFilter(filterItem.filter);

    const onUpdateFilter = (nextFilterClause: Filterable) =>
      handleUpdateFilter(filterItem.filter, nextFilterClause);

    return {
      ...filterItem,
      onRemoveFilter,
      onUpdateFilter,
      filterIndex,
    };
  });
};
