import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import {
  type DateFilterSpec,
  type DimensionTabType,
  type ProjectionConfig,
  type SourceData,
  type TemporalProjectionConfig,
  createTemporalProjectionConfig,
} from "metabase-types/store/metrics-explorer";

import { getTabConfig } from "./tab-registry";

const STAGE_INDEX = -1;

export const UNBINNED = "__unbinned__" as const;

// ============================================================
// COLUMN UTILITIES
// ============================================================

function findFirstDatetimeColumn(query: Lib.Query): Lib.ColumnMetadata | null {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return columns.find((col) => Lib.isDateOrDateTime(col)) ?? null;
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
): DateFilterSpec | null {
  const filters = Lib.filters(query, STAGE_INDEX);
  const columnInfo = Lib.displayInfo(query, STAGE_INDEX, column);

  for (const filter of filters) {
    const relParts = Lib.relativeDateFilterParts(query, STAGE_INDEX, filter);
    if (relParts && relParts.column) {
      const filterColInfo = Lib.displayInfo(
        query,
        STAGE_INDEX,
        relParts.column,
      );
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
      const filterColInfo = Lib.displayInfo(
        query,
        STAGE_INDEX,
        specParts.column,
      );
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
      const filterColInfo = Lib.displayInfo(
        query,
        STAGE_INDEX,
        excParts.column,
      );
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

  const colWithBucket = Lib.withDefaultTemporalBucket(
    query,
    STAGE_INDEX,
    datetimeCol,
  );
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

export function buildModifiedQuery(
  baseQuery: Lib.Query,
  projectionConfig: ProjectionConfig | null,
  tabType: DimensionTabType | undefined,
  tabColumnName: string | undefined,
  dimensionOverride?: string,
): Lib.Query | null {
  const columnName = dimensionOverride ?? tabColumnName;
  if (!tabType || !columnName) {
    return null;
  }

  const config = getTabConfig(tabType);
  return config.applyBreakout(baseQuery, columnName, projectionConfig);
}
