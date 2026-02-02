import type Metadata from "metabase-lib/v1/metadata/Metadata";
import * as Lib from "metabase-lib";
import {
  metricDefinition,
  metricDefinitionToBaseQuery,
  withMeasure,
} from "metabase-lib/metric-definition";
import type { MeasureId } from "metabase-types/api";
import type { ProjectionConfig, SourceData } from "metabase-types/store/metrics-explorer";

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
 * Apply projection config (unit + filter) to a query.
 *
 * Delegates to Lib.applyProjectionConfigToQuery which:
 * 1. Updates the breakout's temporal bucket
 * 2. Only applies filterSpec if NO filter already exists on the column
 * 3. Uses the unbucketed filter column for filter creation
 */
export function applyProjectionConfigToQuery(
  query: Lib.Query,
  config: ProjectionConfig,
): Lib.Query {
  const projConfig = Lib.projectionConfig({
    unit: config.unit,
    filterSpec: config.filterSpec ?? undefined,
  });
  const matcher = Lib.firstDatetimeColumnMatcher();
  return Lib.applyProjectionConfigToQuery(query, STAGE_INDEX, projConfig, matcher);
}

/**
 * Initialize projection config display info from a query.
 */
export function initializeProjectionConfigFromQuery(
  query: Lib.Query,
): ProjectionConfig {
  return Lib.initializeProjectionConfig(query);
}

/**
 * Build a base query from a measure using the MetricDefinition API.
 * Accepts the SourceData for a measure source.
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

  const definition = metricDefinition(provider);
  const definitionWithMeasure = withMeasure(definition, measureId, measureMeta);
  const query = metricDefinitionToBaseQuery(definitionWithMeasure);
  if (!query) {
    return null;
  }

  return Lib.ensureDatetimeBreakout(query);
}

/**
 * Apply both dimension override and projection config to a query.
 */
export function buildModifiedQuery(
  baseQuery: Lib.Query,
  projectionConfig: ProjectionConfig | null,
  dimensionOverride?: string,
): Lib.Query {
  let query = baseQuery;

  // Apply dimension override first (only if provided)
  if (dimensionOverride !== undefined) {
    query = applyDimensionOverrideIfValid(query, dimensionOverride);
  }

  // Then apply projection config
  if (projectionConfig) {
    query = applyProjectionConfigToQuery(query, projectionConfig);
  }

  return query;
}
