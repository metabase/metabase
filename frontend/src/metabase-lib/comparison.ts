import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import type { Query } from "./types";
import { toLegacyQuery } from "./query";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function areQueriesEqual(
  query1: Query,
  query2: Query,
  fieldIds?: number[],
): boolean {
  return areLegacyQueriesEqual(
    toLegacyQuery(query1),
    toLegacyQuery(query2),
    fieldIds,
  );
}
