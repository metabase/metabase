import {
  DIMENSION_PREDICATES,
  getGeoSubtype,
} from "metabase/metrics/common/utils/dimension-types";
import type { IconName } from "metabase/ui";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { getBreakoutSeriesName } from "metabase/visualizations/echarts/cartesian/model/series";
import type { DimensionMetadata } from "metabase-lib/metric";
import { isCountry, isState } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  SeriesSettings,
  VisualizationSettings,
} from "metabase-types/api";

import {
  type BreakoutColorMap,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerDisplayType,
  type MetricsViewerFormulaEntity,
  type MetricsViewerTabType,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import { getEffectiveDefinitionEntry } from "./definition-entries";
import { BREAKOUT_COLUMN_INDEX, DIMENSION_COLUMN_INDEX } from "./series";

// ── Types ──

export interface ChartTypeOption {
  type: MetricsViewerDisplayType;
  icon: IconName;
}

interface GetSettingsParams {
  entity: MetricsViewerFormulaEntity;
  cols: DatasetColumn[];
  color?: string;
  breakoutValue?: string;
  breakoutColors?: BreakoutColorMap;
  isFirstSeries: boolean;
  hasMultipleSeries: boolean;
  cardName: string;
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
}

type DisplayTypeDefinition = {
  dimensionRequired: boolean;
  supportsMultipleSeries: boolean;
  supportsStacking: boolean;
  getSettings: (params: GetSettingsParams) => VisualizationSettings;
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

function getCartesianSettings({
  cols,
  color,
  breakoutColors,
  isFirstSeries,
  hasMultipleSeries,
  cardName,
}: GetSettingsParams): VisualizationSettings {
  const dimensions = [cols[DIMENSION_COLUMN_INDEX].name];
  if (breakoutColors) {
    dimensions.push(cols[BREAKOUT_COLUMN_INDEX].name);
  }

  const metricColName = cols[cols.length - 1].name;

  const seriesSettings: Record<string, SeriesSettings> = {};
  if (breakoutColors) {
    for (const [formattedValue, color] of breakoutColors) {
      const seriesName = getBreakoutSeriesName(
        formattedValue,
        cols[BREAKOUT_COLUMN_INDEX],
        hasMultipleSeries,
        cardName,
      );
      seriesSettings[seriesName] = { color };
    }
  } else if (color) {
    const seriesKey = isFirstSeries ? metricColName : cardName;
    seriesSettings[seriesKey] = {
      color,
      title: isFirstSeries ? cardName : undefined,
    };
  }

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": [metricColName],
    series_settings: seriesSettings,
  };
}

function getScatterSettings(params: GetSettingsParams): VisualizationSettings {
  return {
    ...getCartesianSettings(params),
    "scatter.bubble": undefined,
  };
}

function getMapRegion(col: DatasetColumn): string | null {
  if (isState(col)) {
    return "us_states";
  }
  if (isCountry(col)) {
    return "world_countries";
  }
  return null;
}

function getMapSettings({
  cols,
  color,
}: GetSettingsParams): VisualizationSettings {
  const dimensionCol = cols[DIMENSION_COLUMN_INDEX];
  const mapRegion = getMapRegion(dimensionCol);
  if (!mapRegion) {
    return {};
  }

  return {
    "map.type": "region",
    "map.region": mapRegion,
    "map.dimension": dimensionCol.name,
    "map.metric": cols[cols.length - 1].name,
    "map.colors": color ? getColorplethColorScale(color) : undefined,
  };
}

function getScalarSettings({
  entity,
  cols,
  breakoutValue,
  definitions,
}: Omit<GetSettingsParams, "dimension">): VisualizationSettings {
  const settings: VisualizationSettings = {
    "scalar.field": cols[cols.length - 1].name,
  };
  if (isExpressionEntry(entity)) {
    settings["scalar.label"] = entity.name;
  } else if (isMetricEntry(entity)) {
    const definition = getEffectiveDefinitionEntry(entity, definitions);
    if (!definition.definition) {
      return settings;
    }
    const label = getDefinitionName(definition.definition);
    if (!label) {
      return settings;
    }
    settings["scalar.label"] = label;
    if (breakoutValue) {
      // scalars don't have a dimension, so the breakout column is the first column
      const breakoutColumnName = cols[0].display_name;
      settings["scalar.sublabel"] = `${breakoutColumnName}: ${breakoutValue}`;
    }
  }
  return settings;
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
    getSettings: getCartesianSettings,
    combineSettings: combineColors,
  },
  area: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getCartesianSettings,
    combineSettings: combineColors,
  },
  bar: {
    dimensionRequired: true,
    supportsMultipleSeries: true,
    supportsStacking: true,
    getSettings: getCartesianSettings,
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
    supportsStacking: false,
    getSettings: getMapSettings,
  },
  scalar: {
    dimensionRequired: false,
    supportsMultipleSeries: false,
    supportsStacking: false,
    getSettings: getScalarSettings,
  },
};
