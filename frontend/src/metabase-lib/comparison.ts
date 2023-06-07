import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import { displayInfo } from "./metadata";
import type { Clause, ColumnMetadata, Query } from "./types";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function isClauseColumn(
  query: Query,
  stageIndex: number,
  clause: Clause,
  column: ColumnMetadata,
) {
  const clauseInfo = displayInfo(query, stageIndex, clause);
  const columnInfo = displayInfo(query, stageIndex, column);

  return (
    clauseInfo.table?.name === columnInfo.table?.name &&
    clauseInfo.name === columnInfo.name
  );
}
