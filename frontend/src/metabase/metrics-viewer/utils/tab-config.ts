import type { IconName } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { VisualizationSettings } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../types/viewer-state";

import {
  getGeoSubtype,
  getMapRegionForDimension,
  isGeoDimension,
} from "./metrics";

// ── Shared types ──

export interface ChartTypeOption {
  type: MetricsViewerDisplayType;
  icon: IconName;
}

interface DisplayTypeDefinition {
  supportsMultipleSeries: boolean;
  getSettings: (
    def: MetricDefinition,
    dimension: DimensionMetadata,
  ) => VisualizationSettings;
}

interface BaseTabTypeDefinition {
  type: MetricsViewerTabType;
  autoCreate: boolean;
  dimensionPredicate: (dimension: DimensionMetadata) => boolean;
  dimensionSubtype?: (dimension: DimensionMetadata) => string | null;
  defaultDisplayType: MetricsViewerDisplayType;
  availableDisplayTypes: ChartTypeOption[];
}

interface AggregateTabType extends BaseTabTypeDefinition {
  matchMode: "aggregate";
  fixedId: string;
  fixedLabel: string;
}

interface ExactColumnTabType extends BaseTabTypeDefinition {
  matchMode: "exact-column";
}

export type TabTypeDefinition = AggregateTabType | ExactColumnTabType;

// ── Tab type registry ──

const STANDARD_CHART_TYPES: ChartTypeOption[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
];

const GEO_CHART_TYPES: ChartTypeOption[] = [
  { type: "map", icon: "pinmap" },
  ...STANDARD_CHART_TYPES,
];

const NUMERIC_CHART_TYPES: ChartTypeOption[] = [
  ...STANDARD_CHART_TYPES,
  { type: "scatter", icon: "bubble" },
];

export const TAB_TYPE_REGISTRY: TabTypeDefinition[] = [
  {
    type: "time",
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "time",
    fixedLabel: "Time",
    dimensionPredicate: LibMetric.isDateOrDateTime,
    defaultDisplayType: "line",
    availableDisplayTypes: STANDARD_CHART_TYPES,
  },
  {
    type: "geo",
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "geo",
    fixedLabel: "Location",
    dimensionPredicate: isGeoDimension,
    dimensionSubtype: getGeoSubtype,
    defaultDisplayType: "map",
    availableDisplayTypes: GEO_CHART_TYPES,
  },
  {
    type: "category",
    autoCreate: true,
    matchMode: "exact-column",
    dimensionPredicate: (dimension) =>
      LibMetric.isCategory(dimension) &&
      !isGeoDimension(dimension) &&
      !LibMetric.isBoolean(dimension),
    defaultDisplayType: "bar",
    availableDisplayTypes: STANDARD_CHART_TYPES,
  },
  {
    type: "boolean",
    autoCreate: true,
    matchMode: "exact-column",
    dimensionPredicate: LibMetric.isBoolean,
    defaultDisplayType: "bar",
    availableDisplayTypes: STANDARD_CHART_TYPES,
  },
  {
    type: "numeric",
    autoCreate: false,
    matchMode: "exact-column",
    dimensionPredicate: (dimension) =>
      LibMetric.isNumeric(dimension) &&
      !LibMetric.isID(dimension) &&
      !LibMetric.isCoordinate(dimension),
    defaultDisplayType: "bar",
    availableDisplayTypes: NUMERIC_CHART_TYPES,
  },
];

export function getTabConfig(type: MetricsViewerTabType): TabTypeDefinition {
  const config = TAB_TYPE_REGISTRY.find((config) => config.type === type);
  if (!config) {
    throw new Error(`No tab config found for type: ${type}`);
  }
  return config;
}

// ── Display type registry ──

function getDimensionsAndMetrics(
  def: MetricDefinition,
  dimension: DimensionMetadata,
): {
  dimensions: string[];
  metrics: string[];
} {
  const dimensions: string[] = [];
  const name = LibMetric.displayInfo(def, dimension).name;
  if (name) {
    dimensions.push(name);
  }

  const meta = LibMetric.sourceMetricOrMeasureMetadata(def);
  const metrics = meta ? [LibMetric.displayInfo(def, meta).displayName] : [];

  return { dimensions, metrics };
}

function getChartSettings(
  def: MetricDefinition,
  dimension: DimensionMetadata,
): VisualizationSettings {
  const { dimensions, metrics } = getDimensionsAndMetrics(def, dimension);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
  };
}

function getPieSettings(
  _def: MetricDefinition,
  _dimension: DimensionMetadata,
): VisualizationSettings {
  return {};
}

function getScatterSettings(
  def: MetricDefinition,
  dimension: DimensionMetadata,
): VisualizationSettings {
  return {
    ...getChartSettings(def, dimension),
    "scatter.bubble": undefined,
  };
}

function getMapSettings(
  def: MetricDefinition,
  dimension: DimensionMetadata,
): VisualizationSettings {
  const mapRegion = getMapRegionForDimension(dimension);
  if (!mapRegion) {
    return {};
  }

  const { dimensions, metrics } = getDimensionsAndMetrics(def, dimension);
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
