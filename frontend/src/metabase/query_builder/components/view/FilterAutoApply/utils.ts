import * as Lib from "metabase-lib";
import type { PrototypeDataInfo } from "metabase-types/api";

/** The query with the draft filter in place of `filter`, or added to it. */
export function getQueryWithFilter(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.Filterable | undefined,
  draftFilter: Lib.ExpressionClause | Lib.SegmentMetadata | undefined,
): Lib.Query {
  if (draftFilter == null) {
    return Lib.dropEmptyStages(query);
  }
  const queryWithFilter =
    filter != null && !Lib.isSegmentMetadata(filter)
      ? Lib.replaceClause(query, stageIndex, filter, draftFilter)
      : Lib.filter(query, stageIndex, draftFilter);
  return Lib.dropEmptyStages(queryWithFilter);
}

// Pickers build new clauses, with new ids and slightly different field refs,
// so the same filter must be compared by meaning, not by value.
export function areQueriesEqual(query1: Lib.Query, query2: Lib.Query): boolean {
  return Lib.areLegacyQueriesEqual(
    Lib.toJsQuery(query1),
    Lib.toJsQuery(query2),
  );
}

export function readsSlowTable(
  query: Lib.Query,
  prototypeData: PrototypeDataInfo | null | undefined,
): boolean {
  if (prototypeData == null) {
    return false;
  }
  const slowTableIds = new Set<unknown>(prototypeData.slow_table_ids);
  return Lib.dependentMetadata(query, undefined, "question").some(
    (item) => item.type === "table" && slowTableIds.has(item.id),
  );
}
