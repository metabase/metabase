import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";
import type { DatabaseId } from "metabase-types/api";
import type Metadata from "./metadata/Metadata";
import type { Clause, MetadataProvider, Query, ColumnMetadata } from "./types";

export function metadataProvider(
  databaseId: DatabaseId,
  metadata: Metadata,
): MetadataProvider {
  return ML.metadataProvider(databaseId, metadata);
}

export function displayName(query: Query, clause: Clause): string {
  return ML_MetadataCalculation.display_name(query, clause);
}

export type DisplayInfo = {
  display_name: string;
  name?: string;
  table?: {
    name: string;
    display_name: string;
  };
};

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export function displayInfo(
  query: Query,
  x: Clause | ColumnMetadata,
): DisplayInfo {
  return ML.display_info(query, x);
}
