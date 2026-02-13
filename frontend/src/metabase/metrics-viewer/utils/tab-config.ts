import type { IconName } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { VisualizationSettings } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../types/viewer-state";

import {
  getGeoDimensionRank,
  getMapRegionForDimension,
  isGeoDimension,
} from "./queries";

// ── Shared types ──

export interface ChartTypeOption {
  type: MetricsViewerDisplayType;
  icon: IconName;
}

interface DisplayTypeDefinition {
  supportsMultipleSeries: boolean;
  getSettings: (def: MetricDefinition) => VisualizationSettings;
}

export interface TabTypeDefinition {
  type: MetricsViewerTabType;
  priority: number;
  autoCreate: boolean;
  matchMode: "aggregate" | "exact-column";

  fixedId?: string;
  fixedLabel?: string;

  dimensionPredicate: (dim: DimensionMetadata) => boolean;
  dimensionRanker?: (dim: DimensionMetadata) => number;

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
    dimensionPredicate: LibMetric.isDateOrDateTime,
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
    dimensionPredicate: isGeoDimension,
    dimensionRanker: getGeoDimensionRank,
    defaultDisplayType: "bar",
    availableDisplayTypes: GEO_CHART_TYPES,
  },
  {
    type: "category",
    priority: 2,
    autoCreate: true,
    matchMode: "exact-column",
    dimensionPredicate: (dim) =>
      LibMetric.isCategory(dim) &&
      !isGeoDimension(dim) &&
      !LibMetric.isBoolean(dim) &&
      !LibMetric.isPrimaryKey(dim) &&
      !LibMetric.isForeignKey(dim) &&
      !LibMetric.isURL(dim) &&
      !LibMetric.isEntityName(dim) &&
      !LibMetric.isTitle(dim),
    defaultDisplayType: "bar",
    availableDisplayTypes: CATEGORY_CHART_TYPES,
  },
  {
    type: "boolean",
    priority: 3,
    autoCreate: true,
    matchMode: "exact-column",
    dimensionPredicate: LibMetric.isBoolean,
    defaultDisplayType: "bar",
    availableDisplayTypes: CATEGORY_CHART_TYPES,
  },
  {
    type: "numeric",
    priority: 4,
    autoCreate: false,
    matchMode: "exact-column",
    dimensionPredicate: (dim) =>
      LibMetric.isNumeric(dim) &&
      !LibMetric.isID(dim) &&
      !LibMetric.isCoordinate(dim),
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

function getDimensionsAndMetrics(def: MetricDefinition): {
  dimensions: string[];
  metrics: string[];
} {
  const projs = LibMetric.projections(def);
  const dimensions = projs
    .map((p) => {
      const dim = LibMetric.projectionDimension(def, p);
      return dim ? LibMetric.displayInfo(def, dim).name : undefined;
    })
    .filter((n): n is string => n != null);

  const meta = LibMetric.sourceMetricOrMeasureMetadata(def);
  const metrics = meta ? [LibMetric.displayInfo(def, meta).displayName] : [];

  return { dimensions, metrics };
}

function getChartSettings(def: MetricDefinition): VisualizationSettings {
  const { dimensions, metrics } = getDimensionsAndMetrics(def);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
  };
}

function getPieSettings(_def: MetricDefinition): VisualizationSettings {
  return {};
}

function getScatterSettings(def: MetricDefinition): VisualizationSettings {
  const { dimensions, metrics } = getDimensionsAndMetrics(def);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
    "scatter.bubble": undefined,
  };
}

function getMapSettings(def: MetricDefinition): VisualizationSettings {
  const projs = LibMetric.projections(def);
  if (projs.length === 0) {
    return {};
  }

  const dim = LibMetric.projectionDimension(def, projs[0]);
  if (!dim) {
    return {};
  }

  const mapRegion = getMapRegionForDimension(dim);
  if (!mapRegion) {
    return {};
  }

  const { dimensions, metrics } = getDimensionsAndMetrics(def);
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
