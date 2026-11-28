import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { clearFilters } from "./examples";

export function isExpressionParts(
  arg: Lib.ExpressionArg | Lib.ExpressionParts,
): arg is Lib.ExpressionParts {
  return typeof arg === "object" && arg !== null && "operator" in arg;
}

/**
 * Anything the FilterPicker hands back (a filter clause, an expression clause
 * or a segment) as a `FilterClause`, by adding it to a filter-free scratch
 * copy of the query and reading it back. Avoids casting between the opaque
 * clause types. The scratch query must start empty: `Lib.filter` ignores a
 * clause equal to an existing one, which would hand back that existing clause
 * and duplicate its uuid.
 */
export function toFilterClause(
  query: Lib.Query,
  stageIndex: number,
  filterable: Lib.Filterable,
): Lib.FilterClause {
  const scratch = Lib.filter(
    clearFilters(query, stageIndex),
    stageIndex,
    filterable,
  );
  return checkNotNull(Lib.filters(scratch, stageIndex).at(0));
}

export function getFilterLabel(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): string {
  return Lib.displayInfo(query, stageIndex, filter).longDisplayName;
}
