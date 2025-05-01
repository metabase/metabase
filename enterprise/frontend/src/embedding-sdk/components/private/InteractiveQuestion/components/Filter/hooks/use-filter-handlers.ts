import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import { filter as ML_filter } from "metabase-lib/filter";
import { removeClause, replaceClause } from "metabase-lib/query";
import type { FilterClause, Filterable } from "metabase-lib/types";

export const useFilterHandlers = ({
  query,
  stageIndex = -1,
  onQueryChange,
}: Partial<UpdateQueryHookProps>) => {
  const onAddFilter = (filter: Filterable) => {
    if (query) {
      const nextQuery = ML_filter(query, stageIndex, filter);
      onQueryChange?.(nextQuery);
    }
  };

  const onRemoveFilter = (filterClause: FilterClause) => {
    if (query) {
      const nextQuery = removeClause(query, stageIndex, filterClause);
      onQueryChange?.(nextQuery);
    }
  };

  const onUpdateFilter = (
    currentFilterClause: FilterClause,
    nextFilterClause: Filterable,
  ) => {
    if (query) {
      const nextQuery = replaceClause(
        query,
        stageIndex,
        currentFilterClause,
        nextFilterClause,
      );
      onQueryChange?.(nextQuery);
    }
  };

  return {
    onAddFilter,
    onRemoveFilter,
    onUpdateFilter,
  };
};
