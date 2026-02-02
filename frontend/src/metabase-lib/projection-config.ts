import * as ML from "cljs/metabase.lib.js";
import type { TemporalUnit } from "metabase-types/api";

import type {
  ColumnMatcher,
  ColumnMetadata,
  ExcludeDateFilter,
  MetricDefinition,
  ProjectionConfig,
  Query,
  RelativeDateFilter,
  SpecificDateFilter,
} from "./types";

// DateFilterSpec - reuses base filter types, CLJS handles type discrimination
export type DateFilterSpec =
  | RelativeDateFilter
  | SpecificDateFilter
  | ExcludeDateFilter;

// ProjectionConfigDisplayInfo - display info returned by Lib.displayInfo for ProjectionConfig
export type ProjectionConfigDisplayInfo = {
  unit: TemporalUnit;
  filterSpec: DateFilterSpec | null;
};

// --- ProjectionConfig ---

export type ProjectionConfigOptions = {
  unit?: TemporalUnit;
  filterSpec?: DateFilterSpec;
};

/**
 * Create a projection config with optional initial settings.
 *
 * Options:
 * - unit: temporal unit ("month", "day", "quarter", "year", etc.)
 * - filterSpec: abstract filter specification
 */
export function projectionConfig(
  options?: ProjectionConfigOptions,
): ProjectionConfig {
  if (options) {
    return ML.projection_config(options);
  }
  return ML.projection_config();
}

/**
 * Set the temporal unit on a projection config.
 */
export function withProjectionUnit(
  config: ProjectionConfig,
  unit: TemporalUnit,
): ProjectionConfig {
  return ML.with_projection_unit(config, unit);
}

/**
 * Set the filter spec on a projection config.
 */
export function withProjectionFilter(
  config: ProjectionConfig,
  filterSpec: DateFilterSpec,
): ProjectionConfig {
  return ML.with_projection_filter(config, filterSpec);
}

/**
 * Clear the filter from a projection config.
 */
export function clearProjectionFilter(
  config: ProjectionConfig,
): ProjectionConfig {
  return ML.clear_projection_filter(config);
}

/**
 * Get the temporal unit from a projection config.
 */
export function projectionConfigUnit(config: ProjectionConfig): TemporalUnit {
  return ML.projection_config_unit(config);
}

/**
 * Get the filter spec from a projection config.
 */
export function projectionConfigFilter(
  config: ProjectionConfig,
): DateFilterSpec | null {
  return ML.projection_config_filter(config);
}

// --- Column Matchers ---

/**
 * Create a matcher that finds the first datetime column.
 */
export function firstDatetimeColumnMatcher(): ColumnMatcher {
  return ML.first_datetime_column_matcher();
}

/**
 * Create a matcher that finds the first numeric column.
 */
export function firstNumericColumnMatcher(): ColumnMatcher {
  return ML.first_numeric_column_matcher();
}

/**
 * Create a matcher that finds a column by name.
 */
export function columnMatcherByName(columnName: string): ColumnMatcher {
  return ML.column_matcher_by_name(columnName);
}

/**
 * Create a matcher that finds a column by field ID.
 */
export function columnMatcherByFieldId(fieldId: number): ColumnMatcher {
  return ML.column_matcher_by_field_id(fieldId);
}

// --- Apply to Query ---

/**
 * Apply projection config directly to a query using the column matcher.
 *
 * This function:
 * 1. Finds the column using the matcher
 * 2. Applies temporal bucket (unit) as a breakout
 * 3. Applies filter (if any) to that column
 *
 * Returns the modified query, or the original query if no matching column is found.
 */
export function applyProjectionConfigToQuery(
  query: Query,
  stageIndex: number,
  config: ProjectionConfig,
  matcher: ColumnMatcher,
): Query {
  return ML.apply_projection_config_to_query(query, stageIndex, config, matcher);
}

/**
 * Apply projection config to a MetricDefinition.
 * This is the main integration point between UI config and metric state.
 *
 * 1. Gets the base query from the metric definition
 * 2. Finds the column (via matcher)
 * 3. Clears existing projections/filters on the definition
 * 4. Adds projection with temporal bucket from config.unit
 * 5. Creates filter clause from config.filter-spec
 * 6. Returns updated MetricDefinition
 */
export function applyProjectionConfig(
  metricDef: MetricDefinition,
  config: ProjectionConfig,
  columnMatcher: ColumnMatcher,
): MetricDefinition {
  return ML.apply_projection_config(metricDef, config, columnMatcher);
}

/**
 * If no breakout exists, find first datetime column and add as breakout with default bucket.
 */
export function ensureDatetimeBreakout(query: Query): Query {
  return ML.ensure_datetime_breakout(query);
}

/**
 * Extract projection config display info from an existing query (unit + filter-spec).
 * Looks at the first breakout to determine unit, and extracts any filter on that column.
 *
 * Note: Returns display info format directly (plain JS object with camelCase keys),
 * not an opaque ProjectionConfig type.
 */
export function initializeProjectionConfig(query: Query): ProjectionConfigDisplayInfo {
  return ML.initialize_projection_config(query);
}

/**
 * Extract abstract filter spec from a query's filter on given column.
 * Returns null if no filter is found on the column.
 */
export function extractFilterSpec(
  query: Query,
  column: ColumnMetadata,
): DateFilterSpec | null {
  return ML.extract_filter_spec(query, column);
}
