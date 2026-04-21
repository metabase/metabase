import {
  DIMENSION_PREDICATES,
  getGeoSubtype,
} from "metabase/metrics/common/utils/dimension-types";
import type { IconName } from "metabase/ui";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { VisualizationSettings } from "metabase-types/api";

import type {
  MetricsViewerDisplayType,
  MetricsViewerTabType,
} from "../types/viewer-state";

import { getDefinitionColumnName } from "./definition-builder";
import { getMapRegionForDimension } from "./geo-dimensions";

// ── Types ──

export interface ChartTypeOption {
  type: MetricsViewerDisplayType;
  icon: IconName;
}

type DisplayTypeDefinition =
  | {
      dimensionRequired: true;
      supportsMultipleSeries: boolean;
      supportsStacking: boolean;
      getSettings: (
        def: MetricDefinition,
        dimension: DimensionMetadata,
      ) => VisualizationSettings;
      combineSettings?: (
        settings: VisualizationSettings[],
      ) => VisualizationSettings;
    }
  | {
      dimensionRequired: false;
      supportsMultipleSeries: boolean;
      supportsStacking: boolean;
      getSettings: (def: MetricDefinition) => VisualizationSettings;
      combineSettings?: (
        settings: VisualizationSettings[],
      ) => VisualizationSettings;
    };

interface BaseTabTypeDefinition {
  type: MetricsViewerTabType;
  dimensionPredicate: (dimension: DimensionMetadata) => boolean;
  autoCreate: boolean;
  dimensionSubtype?: (dimension: DimensionMetadata) => string | null;
  defaultDisplayType: MetricsViewerDisplayType;
  availableDisplayTypes: ChartTypeOption[];
  minDimensions: number;
  index?: number;
}

interface AggregateTabType extends BaseTabTypeDefinition {
  matchMode: "aggregate";
  fixedId: string;
}

interface ExactColumnTabType extends BaseTabTypeDefinition {
  matchMode: "exact-column";
}

export type TabTypeDefinition = AggregateTabType | ExactColumnTabType;

// ── Chart type presets ──

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

// ── Tab type registry ──

export const TAB_TYPE_REGISTRY: TabTypeDefinition[] = [
  {
    type: "time",
    dimensionPredicate: DIMENSION_PREDICATES.time,
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "time",
    defaultDisplayType: "line",
    availableDisplayTypes: STANDARD_CHART_TYPES,
    minDimensions: 1,
  },
  {
    type: "geo",
    dimensionPredicate: DIMENSION_PREDICATES.geo,
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "geo",
    dimensionSubtype: getGeoSubtype,
    defaultDisplayType: "map",
    availableDisplayTypes: GEO_CHART_TYPES,
    minDimensions: 1,
  },
  {
    type: "scalar",
    autoCreate: true,
    matchMode: "aggregate",
    fixedId: "scalar",
    dimensionPredicate: () => false,
    defaultDisplayType: "scalar",
    availableDisplayTypes: [{ type: "scalar", icon: "number" }],
    index: 5,
    minDimensions: 0,
  },
  {
    type: "category",
    dimensionPredicate: DIMENSION_PREDICATES.category,
    autoCreate: true,
    matchMode: "exact-column",
    defaultDisplayType: "bar",
    availableDisplayTypes: STANDARD_CHART_TYPES,
    minDimensions: 1,
  },
  {
    type: "boolean",
    dimensionPredicate: DIMENSION_PREDICATES.boolean,
    autoCreate: true,
    matchMode: "exact-column",
    defaultDisplayType: "bar",
    availableDisplayTypes: STANDARD_CHART_TYPES,
    minDimensions: 1,
  },
  {
    type: "numeric",
    dimensionPredicate: DIMENSION_PREDICATES.numeric,
    autoCreate: false,
    matchMode: "exact-column",
    defaultDisplayType: "bar",
    availableDisplayTypes: NUMERIC_CHART_TYPES,
    minDimensions: 1,
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

function getScalarSettings(def: MetricDefinition): VisualizationSettings {
  return {
    "scalar.field": getDefinitionColumnName(def) ?? undefined,
  };
}

function combineColors(
  settings: VisualizationSettings[],
): VisualizationSettings {
  // getStoredSettingsForSeries only looks at settings on the first series
  return settings.reduce((acc, setting) => {
    return {
      ...acc,
      series_settings: {
        ...acc["series_settings"],
        ...setting["series_settings"],
      },
    };
  });
}

export const DISPLAY_TYPE_REGISTRY: Record<
  MetricsViewerDisplayType,
  DisplayTypeDefinition
> = {
  line: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getChartSettings,
    combineSettings: combineColors,
  },
  area: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getChartSettings,
    combineSettings: combineColors,
  },
  bar: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getChartSettings,
    combineSettings: combineColors,
  },
  scatter: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getScatterSettings,
    combineSettings: combineColors,
  },
  map: {
    dimensionRequired: true,
    supportsMultipleSeries: false,
    supportsStacking: true,
    getSettings: getMapSettings,
  },
  scalar: {
    dimensionRequired: false,
    supportsMultipleSeries: false,
    supportsStacking: true,
    getSettings: getScalarSettings,
  },
};
