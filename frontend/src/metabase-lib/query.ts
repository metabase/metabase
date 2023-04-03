import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, DatasetQuery } from "metabase-types/api";
import type { MetadataProvider, Query } from "./types";

export function fromLegacyQuery(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
  datasetQuery: DatasetQuery,
): Query {
  return ML.query(databaseId, metadata, datasetQuery);
}

export function toLegacyQuery(query: Query): DatasetQuery {
  return ML.legacy_query(query);
}

export function suggestedName(query: Query): string {
  return ML.suggestedName(query);
}
