import * as Lib from "metabase-lib";

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
/**
 * Prototype: true when the queries are the same, apart from the `lib/uuid`s.
 * Unlike `areQueriesEqual`, it tells nested ANDs, like the groups of the
 * filter bar, from flat filters: the legacy comparison flattens them.
 */
export function areQueriesIdentical(
  query1: Lib.Query,
  query2: Lib.Query,
): boolean {
  const toJson = (query: Lib.Query) =>
    JSON.stringify(Lib.toJsQuery(query), (key, value) =>
      key === "lib/uuid" ? undefined : value,
    );
  return toJson(query1) === toJson(query2);
}

export function areQueriesEqual(query1: Lib.Query, query2: Lib.Query): boolean {
  return Lib.areLegacyQueriesEqual(
    Lib.toJsQuery(query1),
    Lib.toJsQuery(query2),
  );
}

function removeFilters(query: Lib.Query): Lib.Query {
  const stageIndexes = Array.from(
    { length: Lib.stageCount(query) },
    (_, index) => index,
  );
  const queryWithoutFilters = stageIndexes.reduce(
    (newQuery, stageIndex) =>
      Lib.filters(newQuery, stageIndex).reduce(
        (stageQuery, filter) =>
          Lib.removeClause(stageQuery, stageIndex, filter),
        newQuery,
      ),
    query,
  );
  return Lib.dropEmptyStages(queryWithoutFilters);
}

/** True when the queries differ in their filters and in nothing else. */
export function isFilterOnlyChange(query1: Lib.Query, query2: Lib.Query) {
  return (
    !areQueriesEqual(query1, query2) &&
    areQueriesEqual(removeFilters(query1), removeFilters(query2))
  );
}
