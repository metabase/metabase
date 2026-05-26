import { useCallback, useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import type { FilterItem } from "metabase/querying/filters/components/FilterPanel/types";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import * as Lib from "metabase-lib";

import { LAST_STAGE_INDEX } from "../../../utils/stages";

import { useFilterHandlers } from "./use-filter-handlers";

type FilterItemWithDisplay = FilterItem & Lib.ClauseDisplayInfo;

export interface SDKFilterItem extends FilterItemWithDisplay {
  onRemoveFilter: () => void;
  onUpdateFilter: (nextFilterClause: Lib.Filterable) => void;
  filterIndex: number;
}

export const useFilterData = (): SDKFilterItem[] => {
  const { question, updateQuestion } = useSdkQuestionContext();

  const query = question?.query();
  const onQueryChange = useCallback(
    (newQuery: Lib.Query) => {
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
    stageIndex: LAST_STAGE_INDEX,
    onQueryChange,
  });

  const filters = useMemo(
    () =>
      query
        ? getFilterItems(query).map((filterItem) => ({
            ...filterItem,
            ...Lib.displayInfo(query, filterItem.stageIndex, filterItem.filter),
          }))
        : [],

    [query],
  );

  return filters.map((filterItem, filterIndex) => {
    const onRemoveFilter = () => handleRemoveFilter(filterItem.filter);

    const onUpdateFilter = (nextFilterClause: Lib.Filterable) =>
      handleUpdateFilter(filterItem.filter, nextFilterClause);

    return {
      ...filterItem,
      onRemoveFilter,
      onUpdateFilter,
      filterIndex,
    };
  });
};
