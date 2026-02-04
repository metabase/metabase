import * as ML from "cljs/metabase.lib.js";

import type { AggregationDisplayNamePattern } from "./aggregation";

/**
 * A part of a parsed display name.
 * - static: Should not be translated (separators, unit names, aggregation keywords)
 * - translatable: Should be translated (column names, table names)
 */
export interface DisplayNamePart {
  type: "static" | "translatable";
  value: string;
}

/**
 * Parse a column display name into a flat list of parts for translation.
 *
 * The CLJ side handles all the complexity of understanding display name formats.
 * The FE simply needs to:
 * 1. Translate all parts where type is "translatable"
 * 2. Concatenate all value strings together
 *
 * @param displayName - The display name to parse
 * @param aggregationPatterns - Optional array of aggregation patterns from aggregationDisplayNamePatterns()
 * @returns Array of parts to translate and concatenate
 *
 * @example
 * // Plain column name
 * parseColumnDisplayNameParts("Total")
 * // => [{ type: "translatable", value: "Total" }]
 *
 * @example
 * // Aggregation
 * parseColumnDisplayNameParts("Sum of Total", aggregationDisplayNamePatterns())
 * // => [
 * //   { type: "static", value: "Sum of " },
 * //   { type: "translatable", value: "Total" }
 * // ]
 *
 * @example
 * // Joined column
 * parseColumnDisplayNameParts("Products → Total")
 * // => [
 * //   { type: "translatable", value: "Products" },
 * //   { type: "static", value: " → " },
 * //   { type: "translatable", value: "Total" }
 * // ]
 *
 * @example
 * // Complex: aggregation with join and temporal bucket
 * parseColumnDisplayNameParts("Distinct values of Products → Created At: Month", aggregationDisplayNamePatterns())
 * // => [
 * //   { type: "static", value: "Distinct values of " },
 * //   { type: "translatable", value: "Products" },
 * //   { type: "static", value: " → " },
 * //   { type: "translatable", value: "Created At" },
 * //   { type: "static", value: ": " },
 * //   { type: "static", value: "Month" }
 * // ]
 */
export function parseColumnDisplayNameParts(
  displayName: string,
  aggregationPatterns?: AggregationDisplayNamePattern[],
): DisplayNamePart[] {
  return ML.parse_column_display_name_parts(displayName, aggregationPatterns);
}

/**
 * Separator used for temporal bucket and binning suffixes (e.g., "Total: Month", "Price: 10 bins").
 */
export const COLUMN_DISPLAY_NAME_SEPARATOR: string =
  ML.column_display_name_separator;

/**
 * Separator used for joined table column names (e.g., "Products → Created At").
 */
export const JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.join_display_name_separator;

/**
 * Separator used for implicit join aliases (e.g., "People - Product").
 */
export const IMPLICIT_JOIN_DISPLAY_NAME_SEPARATOR: string =
  ML.implicit_join_display_name_separator;
