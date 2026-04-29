import type { UpdateQueryHookProps } from "metabase/query_builder/hooks";
import * as Lib from "metabase-lib";

import { LAST_STAGE_INDEX } from "../../../utils/stages";

export const useFilterHandlers = ({
  query,
  stageIndex = LAST_STAGE_INDEX,
  onQueryChange,
}: Partial<UpdateQueryHookProps>) => {
  const onAddFilter = (filter: Lib.Filterable) => {
    if (query) {
      const nextQuery = Lib.filter(query, stageIndex, filter);
      onQueryChange?.(nextQuery);
    }
  };

  const onRemoveFilter = (filterClause: Lib.FilterClause) => {
    if (query) {
      const nextQuery = Lib.removeClause(query, stageIndex, filterClause);
      onQueryChange?.(nextQuery);
    }
  };

  const onUpdateFilter = (
    currentFilterClause: Lib.FilterClause,
    nextFilterClause: Lib.Filterable,
  ) => {
    if (query) {
      const nextQuery = Lib.replaceClause(
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
