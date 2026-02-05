import * as ML from "cljs/metabase.lib.js";

import type { AggregationDisplayNamePattern } from "./aggregation";

export interface DisplayNamePart {
  type: "static" | "translatable";
  value: string;
}

export function parseColumnDisplayNameParts(
  displayName: string,
  aggregationPatterns?: AggregationDisplayNamePattern[],
): DisplayNamePart[] {
  return ML.parse_column_display_name_parts(displayName, aggregationPatterns);
}

export const COLUMN_DISPLAY_NAME_SEPARATOR: string =
  ML.column_display_name_separator;

export const JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.join_display_name_separator;

export const IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.implicit_join_display_name_separator;
