import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";
import type { MetricsExplorerDisplayType } from "metabase-types/store/metrics-explorer";

import { getMapRegionForColumn } from "./dimensions";

const STAGE_INDEX = -1;

/**
 * Context provided to visualization settings generators.
 */
export interface VisualizationContext {
  query: Lib.Query;
  resultData: Dataset["data"];
}

/**
 * Function that generates visualization settings for a display type.
 */
type SettingsGenerator = (context: VisualizationContext) => Record<string, unknown>;

/**
 * Configuration for a display type's capabilities and behavior.
 */
interface DisplayTypeConfig {
  /**
   * Whether this display type can show multiple series in a single chart.
   * If false, each series will be rendered in its own chart side by side.
   */
  supportsMultipleSeries: boolean;
  /**
   * Function to generate visualization settings for this display type.
   */
  getSettings: SettingsGenerator;
}

/**
 * Declarative configuration for each display type.
 * Add new display types here with their capabilities.
 */
const DISPLAY_TYPE_CONFIG: Record<MetricsExplorerDisplayType, DisplayTypeConfig> = {
  line: {
    supportsMultipleSeries: true,
    getSettings: getChartSettings,
  },
  area: {
    supportsMultipleSeries: true,
    getSettings: getChartSettings,
  },
  bar: {
    supportsMultipleSeries: true,
    getSettings: getChartSettings,
  },
  row: {
    supportsMultipleSeries: true,
    getSettings: getChartSettings,
  },
  scatter: {
    supportsMultipleSeries: true,
    getSettings: getScatterSettings,
  },
  map: {
    supportsMultipleSeries: false,
    getSettings: getMapSettings,
  },
  pie: {
    supportsMultipleSeries: false,
    getSettings: getPieSettings,
  },
};

/**
 * Check if a display type supports multiple series in one chart.
 */
export function supportsMultipleSeries(displayType: MetricsExplorerDisplayType): boolean {
  return DISPLAY_TYPE_CONFIG[displayType].supportsMultipleSeries;
}

/**
 * Extract dimension and metric column names from result data.
 */
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

/**
 * Settings for chart types (line, area, bar, row).
 * Disables axis labels for cleaner display in the explorer.
 */
function getChartSettings({ resultData }: VisualizationContext): Record<string, unknown> {
  const { dimensions, metrics } = extractDimensionsAndMetrics(resultData);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
  };
}

/**
 * Settings for pie chart visualization.
 */
function getPieSettings(): Record<string, unknown> {
  return {};
}

/**
 * Settings for scatter plot visualization.
 */
function getScatterSettings({ resultData }: VisualizationContext): Record<string, unknown> {
  const { dimensions, metrics } = extractDimensionsAndMetrics(resultData);

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": metrics,
    "scatter.bubble": null,
  };
}

/**
 * Settings for region map visualization.
 * Determines the appropriate map region based on the breakout column type.
 */
function getMapSettings({ query, resultData }: VisualizationContext): Record<string, unknown> {
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

  const dimensionCol = resultData.cols.find((col) => col.source === "breakout");
  const metricCol = resultData.cols.find((col) => col.source === "aggregation");

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

/**
 * Get visualization settings for a display type.
 * Returns appropriate settings based on the display type and data context.
 */
export function getVisualizationSettings(
  displayType: MetricsExplorerDisplayType,
  context: VisualizationContext,
): Record<string, unknown> {
  const config = DISPLAY_TYPE_CONFIG[displayType];
  return config.getSettings(context);
}
