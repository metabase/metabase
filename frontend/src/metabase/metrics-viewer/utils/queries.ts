import type { DatePickerValue } from "metabase/querying/common/types";
import {
  findBreakoutClause,
  findFilterClause,
  findFilterColumn,
} from "metabase/querying/filters/components/TimeseriesChrome/utils";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Card,
  Measure,
  MeasureId,
  Table,
  TemporalUnit,
} from "metabase-types/api";

import { STAGE_INDEX, UNBINNED } from "../constants";
import type { MetricsViewerTabState } from "../types/viewer-state";

// ── Column classification ──

export function isGeoColumn(column: Lib.ColumnMetadata): boolean {
  if (
    Lib.isCoordinate(column) ||
    Lib.isLatitude(column) ||
    Lib.isLongitude(column)
  ) {
    return false;
  }

  return Lib.isState(column) || Lib.isCountry(column) || Lib.isCity(column);
}

export function getMapRegionForColumn(
  column: Lib.ColumnMetadata,
): string | null {
  if (Lib.isState(column)) {
    return "us_states";
  }
  if (Lib.isCountry(column)) {
    return "world_countries";
  }
  if (Lib.isCity(column)) {
    return "us_states";
  }
  return null;
}

export function isDimensionColumn(column: Lib.ColumnMetadata): boolean {
  return (
    !Lib.isPrimaryKey(column) &&
    !Lib.isForeignKey(column) &&
    !Lib.isURL(column) &&
    !Lib.isLatitude(column) &&
    !Lib.isLongitude(column) &&
    !Lib.isCoordinate(column)
  );
}

const GEO_SUBTYPE_PRIORITY = {
  country: 0,
  state: 1,
  city: 2,
} as const;

type GeoSubtype = keyof typeof GEO_SUBTYPE_PRIORITY;

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: GeoSubtype;
  predicate: (col: Lib.ColumnMetadata) => boolean;
}> = [
  { subtype: "country", predicate: Lib.isCountry },
  { subtype: "state", predicate: Lib.isState },
  { subtype: "city", predicate: Lib.isCity },
];

export function getGeoColumnRank(column: Lib.ColumnMetadata): number {
  for (const { subtype, predicate } of GEO_SUBTYPE_PREDICATES) {
    if (predicate(column)) {
      return GEO_SUBTYPE_PRIORITY[subtype] ?? 999;
    }
  }
  return 999;
}

// ── Column lookup ──

export function findBreakoutColumn(
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

export function findColumnByName(
  query: Lib.Query,
  columnName: string,
): Lib.ColumnMetadata | null {
  const breakoutableCols = Lib.breakoutableColumns(query, STAGE_INDEX);

  for (const column of breakoutableCols) {
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    if (info.name === columnName) {
      const bucketedColumn = Lib.withDefaultBucket(query, STAGE_INDEX, column);
      return bucketedColumn ?? column;
    }
  }

  return null;
}

export function findTemporalBucket(
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

// ── Breakout application ──

export function applyBinnedBreakout(
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
    columnWithBucket = Lib.withBinning(targetColumn, null);
  } else if (binningStrategy !== null) {
    const strategies = Lib.availableBinningStrategies(
      query,
      STAGE_INDEX,
      targetColumn,
    );
    const bucket =
      strategies.find((b) => {
        const info = Lib.displayInfo(query, STAGE_INDEX, b);
        return info.displayName === binningStrategy;
      }) ?? null;
    columnWithBucket = Lib.withBinning(targetColumn, bucket);
  } else {
    columnWithBucket = Lib.withDefaultBinning(query, STAGE_INDEX, targetColumn);
  }

  return Lib.replaceClause(query, STAGE_INDEX, breakouts[0], columnWithBucket);
}

export function applyDimensionBreakout(
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

  const bucketedColumn = Lib.withDefaultBucket(query, STAGE_INDEX, targetColumn);
  return Lib.replaceClause(
    query,
    STAGE_INDEX,
    breakouts[0],
    bucketedColumn ?? targetColumn,
  );
}

export function applyTemporalUnit(
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

// ── Filter application ──

export function removeFiltersOnColumn(
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

export function applyDatePickerFilter(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  value: DatePickerValue | undefined,
): Lib.Query {
  const unbucketedColumn = Lib.withTemporalBucket(column, null);
  let result = removeFiltersOnColumn(query, unbucketedColumn);

  if (value) {
    const filterClause = getDateFilterClause(unbucketedColumn, value);
    result = Lib.filter(result, STAGE_INDEX, filterClause);
  }

  return result;
}

// ── Query creation ──

function findFirstDatetimeColumn(query: Lib.Query): Lib.ColumnMetadata | null {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  return columns.find((col) => Lib.isDateOrDateTime(col)) ?? null;
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

export function buildQueryForMetric(
  card: Card,
  metadata: Metadata,
): Lib.Query {
  const question = new Question(card, metadata);
  return ensureDatetimeBreakout(question.query());
}

export function buildQueryForMeasure(
  measureId: MeasureId,
  measure: Measure,
  table: Table,
  metadata: Metadata,
): Lib.Query | null {
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

// ── Composite query builder ──

export function buildExecutableQuery(
  baseQuery: Lib.Query,
  tab: MetricsViewerTabState,
  dimensionId: string | undefined,
): Lib.Query | null {
  if (!dimensionId) {
    return null;
  }

  let query = baseQuery;

  if (tab.type === "time") {
    query = applyDimensionBreakout(query, dimensionId);

    if (tab.projectionTemporalUnit) {
      query = applyTemporalUnit(query, tab.projectionTemporalUnit);
    }

    const breakouts = Lib.breakouts(query, STAGE_INDEX);
    if (breakouts.length > 0) {
      const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
      if (column && tab.filter) {
        query = applyDatePickerFilter(query, column, tab.filter);
      }
    }
  } else if (tab.type === "numeric") {
    query = applyBinnedBreakout(query, dimensionId, tab.binningStrategy ?? null);
  } else {
    query = applyDimensionBreakout(query, dimensionId);
  }

  return query;
}

// ── Breakout inspection ──

export type BreakoutInfo = {
  breakout: Lib.BreakoutClause | undefined;
  breakoutColumn: Lib.ColumnMetadata | undefined;
  filterColumn: Lib.ColumnMetadata | undefined;
  filter: Lib.FilterClause | undefined;
  isTemporalBucketable: boolean;
  isBinnable: boolean;
  hasBinning: boolean;
};

export function getBreakoutInfo(query: Lib.Query): BreakoutInfo {
  const allBreakouts = Lib.breakouts(query, STAGE_INDEX);
  const firstBreakout = allBreakouts[0];

  const temporalBreakout = findBreakoutClause(query, STAGE_INDEX);

  const breakoutColumn = firstBreakout
    ? (Lib.breakoutColumn(query, STAGE_INDEX, firstBreakout) ?? undefined)
    : undefined;
  const isTemporalBucketable = breakoutColumn
    ? Lib.isTemporalBucketable(query, STAGE_INDEX, breakoutColumn)
    : false;
  const isBinnable = breakoutColumn
    ? Lib.isBinnable(query, STAGE_INDEX, breakoutColumn)
    : false;
  const hasBinning = firstBreakout
    ? Lib.binning(firstBreakout) !== null
    : false;

  const filterColumn =
    temporalBreakout && breakoutColumn
      ? findFilterColumn(query, STAGE_INDEX, breakoutColumn)
      : undefined;
  const filter = filterColumn
    ? findFilterClause(query, STAGE_INDEX, filterColumn)
    : undefined;

  return {
    breakout: firstBreakout,
    breakoutColumn,
    filterColumn,
    filter,
    isTemporalBucketable,
    isBinnable,
    hasBinning,
  };
}
