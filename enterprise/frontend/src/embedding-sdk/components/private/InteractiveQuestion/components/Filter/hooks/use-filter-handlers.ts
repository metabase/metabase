import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import * as Lib from "metabase-lib";

export const useFilterHandlers = ({
  query,
  stageIndex,
  onQueryChange,
}: UpdateQueryHookProps) => {
  const getFilterName = (filter: Lib.FilterClause) => {
    return Lib.displayInfo(query, stageIndex, filter).longDisplayName;
  };

  const onAddFilter = (filter: Lib.Filterable) => {
    const nextQuery = Lib.filter(query, stageIndex, filter);
    onQueryChange(nextQuery);
  };

  const onRemoveFilter = (filterClause: Lib.FilterClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, filterClause);
    onQueryChange(nextQuery);
  };

  const onUpdateFilter = (
    currentFilterClause: Lib.FilterClause,
    nextFilterClause: Lib.Filterable,
  ) => {
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      currentFilterClause,
      nextFilterClause,
    );
    onQueryChange(nextQuery);
  };

  return {
    getFilterName,
    onAddFilter,
    onRemoveFilter,
    onUpdateFilter,
  };
};
