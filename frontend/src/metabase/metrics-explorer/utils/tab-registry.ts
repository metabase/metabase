import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Dataset, TemporalUnit } from "metabase-types/api";
import type {
  DateFilterSpec,
  DimensionTabType,
  MetricsExplorerDisplayType,
  ProjectionConfig,
} from "metabase-types/store/metrics-explorer";
import {
  createNumericProjectionConfig,
  createTemporalProjectionConfig,
  isExcludeDateFilterSpec,
  isNumericProjectionConfig,
  isRelativeDateFilterSpec,
  isSpecificDateFilterSpec,
  isTemporalProjectionConfig,
} from "metabase-types/store/metrics-explorer";

const STAGE_INDEX = -1;

export const ALL_TAB_ID = "__all__";

export const MAX_AUTO_TABS = 4;

// ============================================================
// COLUMN CLASSIFICATION
// ============================================================

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

// ============================================================
// SHARED TYPES
// ============================================================

export interface ChartTypeOption {
  type: MetricsExplorerDisplayType;
  icon: IconName;
}

export interface VisualizationContext {
  query: Lib.Query;
  resultData: Dataset["data"];
}

export interface DisplayTypeDefinition {
  supportsMultipleSeries: boolean;
  getSettings: (context: VisualizationContext) => Record<string, unknown>;
}

export interface TabTypeDefinition {
  type: DimensionTabType;
  priority: number;
  autoCreate: boolean;
  matchMode: "aggregate" | "exact-column";

  fixedId?: string;
  fixedLabel?: string;

  columnPredicate: (col: Lib.ColumnMetadata) => boolean;
  columnRanker?: (col: Lib.ColumnMetadata) => number;

  defaultDisplayType: MetricsExplorerDisplayType;
  availableDisplayTypes: ChartTypeOption[];
  defaultProjectionConfig: () => ProjectionConfig;

  applyBreakout: (
    query: Lib.Query,
    columnName: string,
    projectionConfig: ProjectionConfig | null,
  ) => Lib.Query;
}

// ============================================================
// BREAKOUT HELPERS
// ============================================================

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

export function applySimpleBreakout(
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

  return Lib.replaceClause(query, STAGE_INDEX, breakouts[0], targetColumn);
}

export function applyTemporalBreakoutColumn(
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

  const UNBINNED = "__unbinned__";

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

// ============================================================
// TEMPORAL HELPERS
// ============================================================

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

function applyTemporalUnit(query: Lib.Query, unit: TemporalUnit): Lib.Query {
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

function buildFilterFromSpec(
  column: Lib.ColumnMetadata,
  filterSpec: DateFilterSpec,
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

function applyDateFilter(query: Lib.Query, filterSpec: DateFilterSpec): Lib.Query {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return query;
  }

  const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
  if (!column || !Lib.isDateOrDateTime(column)) {
    return query;
  }

  const result = removeFiltersOnColumn(query, column);
  const unbucketedColumn = Lib.withTemporalBucket(column, null);

  const filterClause = buildFilterFromSpec(unbucketedColumn, filterSpec);
  if (!filterClause) {
    return result;
  }

  return Lib.filter(result, STAGE_INDEX, filterClause);
}

// ============================================================
// GEO COLUMN RANKING
// ============================================================

const GEO_SUBTYPE_PRIORITY: Record<string, number> = {
  country: 0,
  state: 1,
  city: 2,
};

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: string;
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

// ============================================================
// TAB TYPE REGISTRY
// ============================================================

const TIME_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
];

const GEO_CHART_TYPES: ChartTypeOption[] = [
  // TODO: re-enable map when ready
  // { type: "map", icon: "pinmap" },
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
];

const CATEGORY_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
  // TODO: re-enable pie when ready
  // { type: "pie", icon: "pie" },
];

const NUMERIC_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
  { type: "scatter", icon: "bubble" },
];

export const TAB_TYPE_REGISTRY: TabTypeDefinition[] = [
  {
    type: "time",
    priority: 0,
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "time",
    fixedLabel: "Time",
    columnPredicate: Lib.isDateOrDateTime,
    defaultDisplayType: "line",
    availableDisplayTypes: TIME_CHART_TYPES,
    defaultProjectionConfig: () => createTemporalProjectionConfig("month"),
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
  {
    type: "geo",
    priority: 1,
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "geo",
    fixedLabel: "Location",
    columnPredicate: isGeoColumn,
    columnRanker: getGeoColumnRank,
    defaultDisplayType: "bar",
    availableDisplayTypes: GEO_CHART_TYPES,
    defaultProjectionConfig: () => createTemporalProjectionConfig("month"),
    applyBreakout: applySimpleBreakout,
  },
  {
    type: "category",
    priority: 2,
    autoCreate: true,
    matchMode: "exact-column",
    columnPredicate: (col) =>
      Lib.isCategory(col) &&
      !isGeoColumn(col) &&
      !Lib.isBoolean(col) &&
      !Lib.isPrimaryKey(col) &&
      !Lib.isForeignKey(col) &&
      !Lib.isURL(col) &&
      !Lib.isEntityName(col) &&
      !Lib.isTitle(col),
    defaultDisplayType: "bar",
    availableDisplayTypes: CATEGORY_CHART_TYPES,
    defaultProjectionConfig: () => createTemporalProjectionConfig("month"),
    applyBreakout: applySimpleBreakout,
  },
  {
    type: "boolean",
    priority: 3,
    autoCreate: true,
    matchMode: "exact-column",
    columnPredicate: Lib.isBoolean,
    defaultDisplayType: "bar",
    availableDisplayTypes: CATEGORY_CHART_TYPES,
    defaultProjectionConfig: () => createTemporalProjectionConfig("month"),
    applyBreakout: applySimpleBreakout,
  },
  {
    type: "numeric",
    priority: 4,
    autoCreate: false,
    matchMode: "exact-column",
    columnPredicate: Lib.isNumeric,
    defaultDisplayType: "bar",
    availableDisplayTypes: NUMERIC_CHART_TYPES,
    defaultProjectionConfig: () => createNumericProjectionConfig(null),
    applyBreakout: (query, columnName, projectionConfig) => {
      const binningStrategy =
        projectionConfig && isNumericProjectionConfig(projectionConfig)
          ? projectionConfig.binningStrategy
          : null;
      return applyBinnedBreakout(query, columnName, binningStrategy);
    },
  },
];

export function getTabConfig(type: DimensionTabType): TabTypeDefinition {
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === type);
  if (!config) {
    return TAB_TYPE_REGISTRY[0];
  }
  return config;
}

// ============================================================
// DISPLAY TYPE REGISTRY
// ============================================================

function extractDimensionsAndMetrics(resultData: Dataset["data"]): {
  dimensions: string[];
  metrics: string[];
} {
  const dimensions: string[] = [];
  const metrics: string[] = [];

  for (const col of resultData.cols) {
    if (col.source === "breakout") {
      dimensions.push(col.name);
    } else if (col.source === "aggregation") {
      metrics.push(col.name);
    }
  }

  return { dimensions, metrics };
}

function getChartSettings({
  resultData,
}: VisualizationContext): Record<string, unknown> {
  const { dimensions, metrics } = extractDimensionsAndMetrics(resultData);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
  };
}

function getPieSettings(): Record<string, unknown> {
  return {};
}

function getScatterSettings({
  resultData,
}: VisualizationContext): Record<string, unknown> {
  const { dimensions, metrics } = extractDimensionsAndMetrics(resultData);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
    "scatter.bubble": null,
  };
}

function getMapSettings({
  query,
  resultData,
}: VisualizationContext): Record<string, unknown> {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  if (breakouts.length === 0) {
    return {};
  }

  const breakoutColumn = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
  if (!breakoutColumn) {
    return {};
  }

  const mapRegion = getMapRegionForColumn(breakoutColumn);
  if (!mapRegion) {
    return {};
  }

  const dimensionCol = resultData.cols.find(
    (col) => col.source === "breakout",
  );
  const metricCol = resultData.cols.find(
    (col) => col.source === "aggregation",
  );

  if (!dimensionCol || !metricCol) {
    return {};
  }

  return {
    "map.type": "region",
    "map.region": mapRegion,
    "map.dimension": dimensionCol.name,
    "map.metric": metricCol.name,
  };
}

// FIXME: visualizations definitions contain supportsMultipleSeries info - reuse from there
export const DISPLAY_TYPE_REGISTRY: Record<
  MetricsExplorerDisplayType,
  DisplayTypeDefinition
> = {
  line: { supportsMultipleSeries: true, getSettings: getChartSettings },
  area: { supportsMultipleSeries: true, getSettings: getChartSettings },
  bar: { supportsMultipleSeries: true, getSettings: getChartSettings },
  row: { supportsMultipleSeries: true, getSettings: getChartSettings },
  scatter: { supportsMultipleSeries: true, getSettings: getScatterSettings },
  map: { supportsMultipleSeries: false, getSettings: getMapSettings },
  pie: { supportsMultipleSeries: false, getSettings: getPieSettings },
};
