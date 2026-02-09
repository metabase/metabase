import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { STAGE_INDEX } from "../constants";
import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../types/viewer-state";

import {
  getGeoColumnRank,
  getMapRegionForColumn,
  isGeoColumn,
} from "./queries";

// ── Shared types ──

export interface ChartTypeOption {
  type: MetricsViewerDisplayType;
  icon: IconName;
}

interface DisplayTypeDefinition {
  supportsMultipleSeries: boolean;
  getSettings: (query: Lib.Query) => VisualizationSettings;
}

export interface TabTypeDefinition {
  type: MetricsViewerTabType;
  priority: number;
  autoCreate: boolean;
  matchMode: "aggregate" | "exact-column";

  fixedId?: string;
  fixedLabel?: string;

  columnPredicate: (col: Lib.ColumnMetadata) => boolean;
  columnRanker?: (col: Lib.ColumnMetadata) => number;

  defaultDisplayType: MetricsViewerDisplayType;
  availableDisplayTypes: ChartTypeOption[];
}

// ── Tab type registry ──

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
  },
  {
    type: "boolean",
    priority: 3,
    autoCreate: true,
    matchMode: "exact-column",
    columnPredicate: Lib.isBoolean,
    defaultDisplayType: "bar",
    availableDisplayTypes: CATEGORY_CHART_TYPES,
  },
  {
    type: "numeric",
    priority: 4,
    autoCreate: false,
    matchMode: "exact-column",
    columnPredicate: (col) =>
      Lib.isNumeric(col) && !Lib.isID(col) && !Lib.isCoordinate(col),
    defaultDisplayType: "bar",
    availableDisplayTypes: NUMERIC_CHART_TYPES,
  },
];

export function getTabConfig(type: MetricsViewerTabType): TabTypeDefinition {
  const config = TAB_TYPE_REGISTRY.find((c) => c.type === type);
  if (!config) {
    return TAB_TYPE_REGISTRY[0];
  }
  return config;
}

// ── Display type registry ──

function getDimensionsAndMetrics(query: Lib.Query): {
  dimensions: string[];
  metrics: string[];
} {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const aggregations = Lib.aggregations(query, STAGE_INDEX);

  const dimensions = breakouts.map(
    (b) => Lib.displayInfo(query, STAGE_INDEX, b).name,
  );
  const metrics = aggregations.map(
    (a) => Lib.displayInfo(query, STAGE_INDEX, a).name,
  );

  return { dimensions, metrics };
}

function getChartSettings(query: Lib.Query): VisualizationSettings {
  const { dimensions, metrics } = getDimensionsAndMetrics(query);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
  };
}

function getPieSettings(_query: Lib.Query): VisualizationSettings {
  return {};
}

function getScatterSettings(query: Lib.Query): VisualizationSettings {
  const { dimensions, metrics } = getDimensionsAndMetrics(query);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
    "scatter.bubble": undefined,
  };
}

function getMapSettings(query: Lib.Query): VisualizationSettings {
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

  const { dimensions, metrics } = getDimensionsAndMetrics(query);
  if (dimensions.length === 0 || metrics.length === 0) {
    return {};
  }

  return {
    "map.type": "region",
    "map.region": mapRegion,
    "map.dimension": dimensions[0],
    "map.metric": metrics[0],
  };
}

// FIXME: visualizations definitions contain supportsMultipleSeries info - reuse from there
export const DISPLAY_TYPE_REGISTRY: Record<
  MetricsViewerDisplayType,
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
