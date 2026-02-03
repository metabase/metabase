import type Metadata from "metabase-lib/v1/metadata/Metadata";
import * as Lib from "metabase-lib";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import type {
  DimensionTabType,
  ProjectionConfig,
  SourceData,
} from "metabase-types/store/metrics-explorer";

const STAGE_INDEX = -1;

/**
 * Check if a column with the given name exists in breakoutable columns.
 */
export function columnExistsInQuery(
  query: Lib.Query,
  columnName: string,
): boolean {
  const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);
  return breakoutableCols.some((col) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    return info.name === columnName;
  });
}

/**
 * Apply a dimension override to a query by replacing the breakout column.
 * Uses temporal bucket for time columns.
 */
export function applyDimensionOverride(
  query: Lib.Query,
  columnName: string,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }
  const breakout = breakouts[0];

  const breakoutableColumns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const targetColumn = breakoutableColumns.find((col) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    return info.name === columnName;
  });

  if (!targetColumn) {
    return query;
  }

  const columnWithBucket = Lib.withDefaultTemporalBucket(
    query,
    STAGE_INDEX,
    targetColumn,
  );

  return Lib.replaceClause(query, STAGE_INDEX, breakout, columnWithBucket);
}

/**
 * Apply a non-temporal breakout by replacing with a raw column (no temporal bucket).
 * Used for category and boolean dimensions.
 */
export function applyNonTemporalBreakout(
  query: Lib.Query,
  columnName: string,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }
  const breakout = breakouts[0];

  const breakoutableColumns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const targetColumn = breakoutableColumns.find((col) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, col);
    return info.name === columnName;
  });

  if (!targetColumn) {
    return query;
  }

  // Use the column directly without any temporal bucket
  return Lib.replaceClause(query, STAGE_INDEX, breakout, targetColumn);
}

/**
 * Apply dimension override if the column exists in the query.
 */
export function applyDimensionOverrideIfValid(
  query: Lib.Query,
  columnName: string,
): Lib.Query {
  if (!columnExistsInQuery(query, columnName)) {
    return query;
  }
  return applyDimensionOverride(query, columnName);
}

/**
 * Find the first datetime column from breakoutable columns.
 */
function findFirstDatetimeColumn(
  query: Lib.Query,
): Lib.ColumnMetadata | null {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return columns.find((col) => Lib.isDateOrDateTime(col)) ?? null;
}

/**
 * Find a temporal bucket matching the given unit.
 */
function findTemporalBucket(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  targetUnit: TemporalUnit,
): Lib.Bucket | null {
  const buckets = Lib.availableTemporalBuckets(query, STAGE_INDEX, column);
  const bucket = buckets.find((b) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, b);
    return info.shortName === targetUnit;
  });
  return bucket ?? null;
}

/**
 * Apply temporal unit to the first breakout.
 */
function applyTemporalUnit(
  query: Lib.Query,
  unit: TemporalUnit,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const breakout = breakouts[0];
  const column = Lib.breakoutColumn(query, STAGE_INDEX, breakout);
  if (!column || !Lib.isDateOrDateTime(column)) {
    return query;
  }

  const bucket = findTemporalBucket(query, column, unit);
  if (!bucket) {
    return query;
  }

  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  return Lib.replaceClause(query, STAGE_INDEX, breakout, columnWithBucket);
}

/**
 * Apply projection config (unit + filter) to a query.
 *
 * This function:
 * 1. Updates the breakout's temporal bucket
 * 2. Applies filterSpec if provided (does NOT check for existing filters)
 */
export function applyProjectionConfigToQuery(
  query: Lib.Query,
  config: ProjectionConfig,
): Lib.Query {
  let result = query;

  // 1. Apply temporal unit to first datetime breakout
  result = applyTemporalUnit(result, config.unit);

  // 2. Apply filter spec if present
  if (config.filterSpec) {
    result = applyDateFilter(result, config.filterSpec);
  }

  return result;
}

/**
 * Remove existing filters on the given column.
 */
function removeFiltersOnColumn(
  query: Lib.Query,
  targetColumn: Lib.ColumnMetadata,
): Lib.Query {
  const existingFilters = Lib.filters(query, STAGE_INDEX);
  const targetColInfo = Lib.displayInfo(query, STAGE_INDEX, targetColumn);

  let result = query;
  for (const filter of existingFilters) {
    const parts = Lib.filterParts(query, STAGE_INDEX, filter);
    if (parts && "column" in parts && parts.column) {
      const filterColInfo = Lib.displayInfo(query, STAGE_INDEX, parts.column);
      if (filterColInfo.name === targetColInfo.name) {
        result = Lib.removeClause(result, STAGE_INDEX, filter);
      }
    }
  }
  return result;
}

/**
 * Apply a date filter to the query based on the filter spec.
 */
function applyDateFilter(
  query: Lib.Query,
  filterSpec: NonNullable<ProjectionConfig["filterSpec"]>,
): Lib.Query {
  // Find datetime column from first breakout
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
  if (!column || !Lib.isDateOrDateTime(column)) {
    return query;
  }

  // Remove existing filters on this column first
  let result = removeFiltersOnColumn(query, column);

  // Build filter clause from spec
  const filterClause = buildFilterFromSpec(column, filterSpec);
  if (!filterClause) {
    return result;
  }

  return Lib.filter(result, STAGE_INDEX, filterClause);
}

/**
 * Build a filter clause from a filter spec.
 */
function buildFilterFromSpec(
  column: Lib.ColumnMetadata,
  filterSpec: NonNullable<ProjectionConfig["filterSpec"]>,
): Lib.ExpressionClause | null {
  // RelativeDateFilter: has "value" (number) and "unit", no "operator"
  if ("value" in filterSpec && !("operator" in filterSpec)) {
    return Lib.relativeDateFilterClause({
      column,
      value: filterSpec.value,
      unit: filterSpec.unit,
      offsetValue: filterSpec.offsetValue ?? undefined,
      offsetUnit: filterSpec.offsetUnit ?? undefined,
      options: filterSpec.options,
    });
  }

  // SpecificDateFilter: has "operator", "values" (Date[]), "hasTime"
  if ("hasTime" in filterSpec) {
    return Lib.specificDateFilterClause({
      column,
      operator: filterSpec.operator,
      values: filterSpec.values,
      hasTime: filterSpec.hasTime,
    });
  }

  // ExcludeDateFilter: has "operator", "values" (number[]), optionally "unit"
  if ("operator" in filterSpec && "values" in filterSpec) {
    return Lib.excludeDateFilterClause({
      column,
      operator: filterSpec.operator,
      unit: filterSpec.unit ?? undefined,
      values: filterSpec.values,
    });
  }

  return null;
}

/**
 * Extract the unit from an existing query's first breakout.
 */
function extractUnitFromQuery(query: Lib.Query): TemporalUnit {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return "month";
  }

  const breakout = breakouts[0];
  const bucket = Lib.temporalBucket(breakout);
  if (!bucket) {
    return "month";
  }

  const info = Lib.displayInfo(query, STAGE_INDEX, bucket);
  return info.shortName as TemporalUnit;
}

/**
 * Extract filter spec from a query's filter on the given column.
 */
export function extractFilterSpecFromQuery(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): ProjectionConfig["filterSpec"] {
  const filters = Lib.filters(query, STAGE_INDEX);
  const columnInfo = Lib.displayInfo(query, STAGE_INDEX, column);

  for (const filter of filters) {
    // Try relative date filter
    const relParts = Lib.relativeDateFilterParts(query, STAGE_INDEX, filter);
    if (relParts && relParts.column) {
      const filterColInfo = Lib.displayInfo(query, STAGE_INDEX, relParts.column);
      if (filterColInfo.name === columnInfo.name) {
        return {
          value: relParts.value,
          unit: relParts.unit,
          offsetValue: relParts.offsetValue,
          offsetUnit: relParts.offsetUnit,
          options: relParts.options,
        };
      }
    }

    // Try specific date filter
    const specParts = Lib.specificDateFilterParts(query, STAGE_INDEX, filter);
    if (specParts && specParts.column) {
      const filterColInfo = Lib.displayInfo(query, STAGE_INDEX, specParts.column);
      if (filterColInfo.name === columnInfo.name) {
        return {
          operator: specParts.operator,
          values: specParts.values,
          hasTime: specParts.hasTime,
        };
      }
    }

    // Try exclude date filter
    const excParts = Lib.excludeDateFilterParts(query, STAGE_INDEX, filter);
    if (excParts && excParts.column) {
      const filterColInfo = Lib.displayInfo(query, STAGE_INDEX, excParts.column);
      if (filterColInfo.name === columnInfo.name) {
        return {
          operator: excParts.operator,
          unit: excParts.unit,
          values: excParts.values,
        };
      }
    }
  }

  return null;
}

/**
 * Initialize projection config from an existing query.
 */
export function initializeProjectionConfigFromQuery(
  query: Lib.Query,
): ProjectionConfig {
  const unit = extractUnitFromQuery(query);

  // Extract filter spec from breakout column
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  let filterSpec: ProjectionConfig["filterSpec"] = null;

  if (breakouts.length > 0) {
    const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
    if (column) {
      filterSpec = extractFilterSpecFromQuery(query, column);
    }
  }

  return { unit, filterSpec };
}

/**
 * Ensure a query has a datetime breakout.
 * If no breakout exists, find first datetime column and add as breakout with default bucket.
 */
export function ensureDatetimeBreakout(query: Lib.Query): Lib.Query {
  const existingBreakouts = Lib.breakouts(query, STAGE_INDEX);
  if (existingBreakouts.length > 0) {
    return query;
  }

  const datetimeCol = findFirstDatetimeColumn(query);
  if (!datetimeCol) {
    return query;
  }

  const colWithBucket = Lib.withDefaultTemporalBucket(query, STAGE_INDEX, datetimeCol);
  return Lib.breakout(query, STAGE_INDEX, colWithBucket);
}

/**
 * Build a base query from a measure.
 * Creates a query with the measure as an aggregation and ensures a datetime breakout.
 */
export function buildMeasureQuery(
  measureId: MeasureId,
  sourceData: SourceData & { type: "measure" },
  metadata: Metadata,
): Lib.Query | null {
  const { table } = sourceData.data;

  const provider = Lib.metadataProvider(table.db_id, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(provider, table.id);
  if (!tableMetadata) {
    return null;
  }

  const baseQuery = Lib.queryFromTableOrCardMetadata(provider, tableMetadata);
  const measureMeta = Lib.measureMetadata(baseQuery, measureId);
  if (!measureMeta) {
    return null;
  }

  // Add the measure as an aggregation
  const queryWithMeasure = Lib.aggregate(baseQuery, STAGE_INDEX, measureMeta);

  // Ensure the query has a datetime breakout
  return ensureDatetimeBreakout(queryWithMeasure);
}

/**
 * Apply both dimension override and projection config to a query.
 * For non-time tabs (category/boolean), applies a non-temporal breakout instead.
 */
export function buildModifiedQuery(
  baseQuery: Lib.Query,
  projectionConfig: ProjectionConfig | null,
  dimensionOverride?: string,
  tabType?: DimensionTabType,
  tabColumnName?: string,
): Lib.Query {
  let query = baseQuery;

  // For non-time tabs, apply non-temporal breakout
  if (tabType && tabType !== "time" && tabColumnName) {
    // Apply dimension override if provided, otherwise use the tab's column
    const columnName = dimensionOverride ?? tabColumnName;
    query = applyNonTemporalBreakout(query, columnName);
    // Skip projection config for non-time tabs (no filter/unit controls)
    return query;
  }

  // Time tab: apply dimension override first (only if provided)
  if (dimensionOverride !== undefined) {
    query = applyDimensionOverrideIfValid(query, dimensionOverride);
  }

  // Then apply projection config
  if (projectionConfig) {
    query = applyProjectionConfigToQuery(query, projectionConfig);
  }

  return query;
}
