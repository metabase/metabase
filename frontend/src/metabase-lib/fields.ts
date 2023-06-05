import * as ML from "cljs/metabase.lib.js";
import type { Clause, ColumnMetadata, Query } from "./types";

const DEFAULT_STAGE_INDEX = -1;

export function fields(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): Clause[] {
  return ML.fields(query, stageIndex);
}

export function withFields(
  query: Query,
  stageIndex: number,
  newFields: ColumnMetadata[],
): Query {
  return ML.with_fields(query, stageIndex, newFields);
}

export function fieldableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.fieldable_columns(query, stageIndex);
}
