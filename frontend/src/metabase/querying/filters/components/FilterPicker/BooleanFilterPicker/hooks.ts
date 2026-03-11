import { useState } from "react";

import type * as Lib from "metabase-lib";

import { getFilterClause, getFilterValue } from "./utils";

type UseBooleanFilterProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
};

export function useBooleanFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseBooleanFilterProps) {
  const [value, setValue] = useState(() =>
    getFilterValue(query, stageIndex, filter),
  );

  return {
    value,
    getFilterClause: () => getFilterClause(column, value),
    setValue,
  };
}
