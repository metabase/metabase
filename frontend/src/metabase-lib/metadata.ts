import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";
import type { DatabaseId } from "metabase-types/api";
import type Metadata from "./metadata/Metadata";
import type {
  Clause,
  ColumnDisplayInfo,
  ColumnGroup,
  ColumnMetadata,
  MetadataProvider,
  OrderByClause,
  OrderByClauseDisplayInfo,
  TableDisplayInfo,
  Query,
} from "./types";

export function metadataProvider(
  databaseId: DatabaseId,
  metadata: Metadata,
): MetadataProvider {
  return ML.metadataProvider(databaseId, metadata);
}

export function displayName(query: Query, clause: Clause): string {
  return ML_MetadataCalculation.display_name(query, clause);
}

declare function DisplayInfoFn(
  query: Query,
  columnMetadata: ColumnMetadata,
): ColumnDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  columnGroup: ColumnGroup,
): ColumnDisplayInfo | TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  orderByClause: OrderByClause,
): OrderByClauseDisplayInfo;

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export const displayInfo: typeof DisplayInfoFn = ML.display_info;

export function groupColumns(columns: ColumnMetadata[]): ColumnGroup[] {
  return ML.group_columns(columns);
}

export function getColumnsFromColumnGroup(
  group: ColumnGroup,
): ColumnMetadata[] {
  return ML.columns_group_columns(group);
}
