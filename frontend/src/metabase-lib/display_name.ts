import * as ML from "cljs/metabase.lib.js";

export interface DisplayNamePart {
  type: "static" | "translatable";
  value: string;
}

export function parseColumnDisplayNameParts(
  displayName: string,
): DisplayNamePart[] {
  return ML.parse_column_display_name_parts(displayName);
}

export const COLUMN_DISPLAY_NAME_SEPARATOR: string =
  ML.column_display_name_separator;

export const JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.join_display_name_separator;

export const IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.implicit_join_display_name_separator;
