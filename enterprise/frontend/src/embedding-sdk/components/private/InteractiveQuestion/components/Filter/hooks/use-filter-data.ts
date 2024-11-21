import { useCallback, useMemo } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import type { FilterItem } from "metabase/querying/filters/components/FilterPanel/types";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import * as Lib from "metabase-lib";

type FilterItemWithDisplay = FilterItem & Lib.ClauseDisplayInfo;

export interface SDKFilterItem extends FilterItemWithDisplay {
  onRemoveFilter: () => void;
  onUpdateFilter: (nextFilterClause: Lib.Filterable) => void;
  filterIndex: number;
}

export const useFilterData = (): SDKFilterItem[] => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  const query = question?.query();

  const onQueryChange = useCallback(
    (newQuery: Lib.Query) => {
      if (question) {
        updateQuestion(question.setQuery(newQuery), { run: true });
      }
    },
    [question, updateQuestion],
  );

  const filters = useMemo(
    () =>
      query
        ? getFilterItems(query).map(filterItem => ({
            ...filterItem,
            ...Lib.displayInfo(query, filterItem.stageIndex, filterItem.filter),
          }))
        : [],
    [query],
  );

  return filters.map((filterItem, filterIndex) => {
    const onRemoveFilter = () => {
      if (query) {
        const nextQuery = Lib.removeClause(
          query,
          filterItem.stageIndex,
          filterItem.filter,
        );
        onQueryChange(nextQuery);
      }
    };

    const onUpdateFilter = (nextFilterClause: Lib.Filterable) => {
      if (query) {
        const nextQuery = Lib.replaceClause(
          query,
          filterItem.stageIndex,
          filterItem.filter,
          nextFilterClause,
        );
        onQueryChange(nextQuery);
      }
    };

    return {
      ...filterItem,
      onRemoveFilter,
      onUpdateFilter,
      filterIndex,
    };
  });
};
