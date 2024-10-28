import * as ML from "cljs/metabase.lib.js";

import type { ColumnMetadata } from "./types";

export function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

export function filterComparableFields(field: any, fields: any[]): any[] {
  return ML.filter_comparable_fields(field, fields);
}
