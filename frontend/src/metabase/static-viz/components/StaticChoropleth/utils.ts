import Color from "color";
import type { Feature, FeatureCollection } from "geojson";

import { getCanonicalRowKey } from "metabase/visualizations/lib/region-codes";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { getStoredSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { GeoJSONData, RawSeries, RowValue } from "metabase-types/api";

// Color constants and legend helpers are shared with the runtime ChoroplethMap via
// metabase/visualizations/lib/choropleth (a Leaflet-free module the static-viz bundle can load).

// Internal projection resolution, not output size — the SVG is rasterized at a fixed width downstream.
export const MAP_WIDTH = 1000;

// Batik requires rgb colors
export const toRgb = (color: string): string => Color(color).rgb().string();

export function isFeatureCollection(
  value: GeoJSONData,
): value is FeatureCollection {
  return value.type === "FeatureCollection";
}

export function getFeatures(geoJson: GeoJSONData): Feature[] {
  return isFeatureCollection(geoJson) ? geoJson.features : [geoJson];
}

export function getFeatureKey(feature: Feature, keyProperty: string): string {
  return String(feature.properties?.[keyProperty]).toLowerCase();
}

// `map` isn't registered in the static-viz bundle (needs Leaflet), so computed settings here lack the
// `settings.column` accessor — rebuild it so PDF legends format the metric like the live ChoroplethMap.
export function getStaticChoroplethSettings(
  rawSeries: RawSeries,
): ComputedVisualizationSettings {
  const storedSettings = getStoredSettingsForSeries(rawSeries);
  return {
    ...storedSettings,
    ...getComputedSettings(columnSettings(), rawSeries, storedSettings),
  };
}

// Sum each row's metric by canonical region key (for feature lookup); non-numeric metrics count as 0.
export function getRegionValues(
  rows: RowValue[][],
  dimensionIndex: number,
  metricIndex: number,
  region: string | undefined,
): Record<string, number> {
  const valuesMap: Record<string, number> = {};
  for (const row of rows) {
    const key = getCanonicalRowKey(row[dimensionIndex], region);
    const value = row[metricIndex];
    valuesMap[key] =
      (valuesMap[key] || 0) + (typeof value === "number" ? value : 0);
  }
  return valuesMap;
}
