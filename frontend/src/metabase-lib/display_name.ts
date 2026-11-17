/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import * as ML from "cljs/metabase.lib.js";

export interface DisplayNamePart {
  type: "static" | "translatable";
  value: string;
}

export function parseColumnDisplayNameParts(
  displayName: string,
  locale: string,
): DisplayNamePart[] {
  return ML.parse_column_display_name_parts(displayName, locale);
}
