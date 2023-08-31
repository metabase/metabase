import { createContext } from "react";

import type * as ML from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

export interface FilterContextType {
  filter?: ML.FilterClause;
  query?: ML.Query;
  legacyQuery?: StructuredQuery;
  column?: ML.ColumnWithOperators;
  stageIndex: number;
}

export const FilterContext = createContext<FilterContextType>({
  filter: undefined,
  query: undefined,
  legacyQuery: undefined,
  column: undefined,
  stageIndex: -1,
});
