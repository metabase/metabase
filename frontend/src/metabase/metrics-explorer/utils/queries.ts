import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import {
  type DimensionTabType,
  type ProjectionConfig,
  type SourceData,
  type TemporalProjectionConfig,
  createTemporalProjectionConfig,
  isExcludeDateFilterSpec,
  isNumericProjectionConfig,
  isRelativeDateFilterSpec,
  isSpecificDateFilterSpec,
  isTemporalProjectionConfig,
} from "metabase-types/store/metrics-explorer";

const STAGE_INDEX = -1;

/**
 * Sentinel value indicating "no binning" (unbinned).
 * Distinguished from null which means "use default binning".
 */
export const UNBINNED = "__unbinned__" as const;

// ============================================================
// TAB TYPE CONFIGURATION - Declarative rules for each tab type
// ============================================================

/**
 * Configuration for how each tab type handles column matching and projection application.
 */
interface TabTypeQueryConfig {
  /**
   * Applies the breakout for this tab type to a query.
   * Returns the modified query with the appropriate breakout applied.
   */
  applyBreakout: (
    query: Lib.Query,
    columnName: string,
    projectionConfig: ProjectionConfig | null,
  ) => Lib.Query;
}

/**
 * Declarative configuration mapping tab types to their query building behavior.
 */
const TAB_TYPE_QUERY_CONFIG: Record<DimensionTabType, TabTypeQueryConfig> = {
  time: {
    applyBreakout: (query, columnName, projectionConfig) => {
      let result = applyTemporalBreakoutColumn(query, columnName);
      if (projectionConfig && isTemporalProjectionConfig(projectionConfig)) {
        result = applyTemporalUnit(result, projectionConfig.unit);
        if (projectionConfig.filterSpec) {
          result = applyDateFilter(result, projectionConfig.filterSpec);
        }
      }
      return result;
    },
  },
  geo: {
    applyBreakout: (query, columnName) => {
      return applySimpleBreakout(query, columnName);
    },
  },
  boolean: {
    applyBreakout: (query, columnName) => {
      return applySimpleBreakout(query, columnName);
    },
  },
  category: {
    applyBreakout: (query, columnName) => {
      return applySimpleBreakout(query, columnName);
    },
  },
  numeric: {
    applyBreakout: (query, columnName, projectionConfig) => {
      const binningStrategy =
        projectionConfig && isNumericProjectionConfig(projectionConfig)
          ? projectionConfig.binningStrategy
          : null;
      return applyBinnedBreakout(query, columnName, binningStrategy);
    },
  },
};

// ============================================================
// COLUMN UTILITIES
// ============================================================

/**
 * Find a breakoutable column by name.
 */
function findBreakoutColumn(
  query: Lib.Query,
  columnName: string,
): Lib.ColumnMetadata | null {
  const breakoutableColumns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return (
    breakoutableColumns.find((col) => {
      const info = Lib.displayInfo(query, STAGE_INDEX, col);
      return info.name === columnName;
    }) ?? null
  );
}

// ============================================================
// BREAKOUT APPLICATION HELPERS
// ============================================================

/**
 * Apply a simple breakout without any bucketing.
 * Used for category, boolean, and geo tab types.
 */
function applySimpleBreakout(query: Lib.Query, columnName: string): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const targetColumn = findBreakoutColumn(query, columnName);
  if (!targetColumn) {
    return query;
  }

  return Lib.replaceClause(query, STAGE_INDEX, breakouts[0], targetColumn);
}

/**
 * Apply a temporal breakout column (switching to a different date column).
 */
function applyTemporalBreakoutColumn(
  query: Lib.Query,
  columnName: string,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const targetColumn = findBreakoutColumn(query, columnName);
  if (!targetColumn) {
    return query;
  }

  const columnWithBucket = Lib.withDefaultTemporalBucket(
    query,
    STAGE_INDEX,
    targetColumn,
  );

  return Lib.replaceClause(query, STAGE_INDEX, breakouts[0], columnWithBucket);
}

/**
 * Apply a binned breakout for numeric columns.
 * Binning strategy values:
 * - null: Use default binning (Auto bin) - applies the bucket with default: true
 * - UNBINNED: No binning - column is used as-is
 * - string: Specific strategy name (e.g., "10 bins", "50 bins")
 */
function applyBinnedBreakout(
  query: Lib.Query,
  columnName: string,
  binningStrategy: string | null,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const targetColumn = findBreakoutColumn(query, columnName);
  if (!targetColumn) {
    return query;
  }

  let columnWithBucket: Lib.ColumnMetadata;
  if (binningStrategy === UNBINNED) {
    // Explicit unbinned - no binning applied
    columnWithBucket = Lib.withBinning(targetColumn, null);
  } else if (binningStrategy !== null) {
    // Specific strategy by name
    const bucket = findBinningBucket(query, targetColumn, binningStrategy);
    columnWithBucket = Lib.withBinning(targetColumn, bucket);
  } else {
    // null means "use default binning" - finds the bucket with default: true
    columnWithBucket = Lib.withDefaultBinning(query, STAGE_INDEX, targetColumn);
  }

  return Lib.replaceClause(query, STAGE_INDEX, breakouts[0], columnWithBucket);
}

/**
 * Find a binning bucket by display name.
 */
function findBinningBucket(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  binningName: string | null,
): Lib.Bucket | null {
  if (binningName === null) {
    return null;
  }

  const strategies = Lib.availableBinningStrategies(query, STAGE_INDEX, column);
  const bucket = strategies.find((b) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, b);
    return info.displayName === binningName;
  });

  return bucket ?? null;
}

function findFirstDatetimeColumn(
  query: Lib.Query,
): Lib.ColumnMetadata | null {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return columns.find((col) => Lib.isDateOrDateTime(col)) ?? null;
}

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

function applyDateFilter(
  query: Lib.Query,
  filterSpec: NonNullable<ProjectionConfig["filterSpec"]>,
): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
  if (!column || !Lib.isDateOrDateTime(column)) {
    return query;
  }

  const result = removeFiltersOnColumn(query, column);

  // Filters should use unbucketed column to avoid temporal granularity in the filter clause
  const unbucketedColumn = Lib.withTemporalBucket(column, null);

  const filterClause = buildFilterFromSpec(unbucketedColumn, filterSpec);
  if (!filterClause) {
    return result;
  }

  return Lib.filter(result, STAGE_INDEX, filterClause);
}

function buildFilterFromSpec(
  column: Lib.ColumnMetadata,
  filterSpec: NonNullable<ProjectionConfig["filterSpec"]>,
): Lib.ExpressionClause | null {
  if (isRelativeDateFilterSpec(filterSpec)) {
    return Lib.relativeDateFilterClause({
      column,
      value: filterSpec.value,
      unit: filterSpec.unit,
      offsetValue: filterSpec.offsetValue,
      offsetUnit: filterSpec.offsetUnit,
      options: filterSpec.options,
    });
  }

  if (isSpecificDateFilterSpec(filterSpec)) {
    return Lib.specificDateFilterClause({
      column,
      operator: filterSpec.operator,
      values: filterSpec.values,
      hasTime: filterSpec.hasTime,
    });
  }

  if (isExcludeDateFilterSpec(filterSpec)) {
    return Lib.excludeDateFilterClause({
      column,
      operator: filterSpec.operator,
      unit: filterSpec.unit,
      values: filterSpec.values,
    });
  }

  return null;
}

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

export function extractFilterSpecFromQuery(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): ProjectionConfig["filterSpec"] {
  const filters = Lib.filters(query, STAGE_INDEX);
  const columnInfo = Lib.displayInfo(query, STAGE_INDEX, column);

  for (const filter of filters) {
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

export function initializeProjectionConfigFromQuery(
  query: Lib.Query,
): TemporalProjectionConfig {
  const unit = extractUnitFromQuery(query);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  let filterSpec: TemporalProjectionConfig["filterSpec"] = null;

  if (breakouts.length > 0) {
    const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
    if (column) {
      filterSpec = extractFilterSpecFromQuery(query, column);
    }
  }

  return createTemporalProjectionConfig(unit, filterSpec);
}

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

  const queryWithMeasure = Lib.aggregate(baseQuery, STAGE_INDEX, measureMeta);
  return ensureDatetimeBreakout(queryWithMeasure);
}

/**
 * Build a modified query for a specific tab type and column.
 * Uses the declarative TAB_TYPE_QUERY_CONFIG to apply the appropriate breakout.
 *
 * @param baseQuery - The base query to modify
 * @param projectionConfig - Temporal or numeric projection settings
 * @param tabType - The type of dimension tab (time, geo, category, etc.)
 * @param tabColumnName - The column name to use for the breakout
 * @param dimensionOverride - Optional override for the column name
 * @returns Modified query with appropriate breakout applied, or null if invalid
 */
export function buildModifiedQuery(
  baseQuery: Lib.Query,
  projectionConfig: ProjectionConfig | null,
  tabType: DimensionTabType | undefined,
  tabColumnName: string | undefined,
  dimensionOverride?: string,
): Lib.Query | null {
  // Must have a tab type and column name to build a valid query
  if (!tabType || !tabColumnName) {
    return null;
  }

  const columnName = dimensionOverride ?? tabColumnName;
  const config = TAB_TYPE_QUERY_CONFIG[tabType];

  return config.applyBreakout(baseQuery, columnName, projectionConfig);
}
