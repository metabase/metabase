import Color from "color";
import type { Feature, FeatureCollection } from "geojson";

import { formatValue } from "metabase/visualizations/lib/formatting";
import { getCanonicalRowKey } from "metabase/visualizations/lib/region-codes";
import type { GeoJSONData, RowValue } from "metabase-types/api";

// Kept in sync with the runtime ChoroplethMap. We intentionally do not import from there because that
// module pulls in Leaflet, which cannot load in the static-viz (GraalJS, no-DOM) bundle.
// eslint-disable-next-line metabase/no-color-literals
export const HEAT_MAP_COLORS = [
  "#C4E4FF",
  "#81C5FF",
  "#51AEFF",
  "#1E96FF",
  "#0061B5",
];
// eslint-disable-next-line metabase/no-color-literals
export const HEAT_MAP_ZERO_COLOR = "#CCC";

// if the average formatted length is greater than this, we switch to compact formatting
const AVERAGE_LENGTH_CUTOFF = 5;

// Internal projection resolution, not output size — the SVG is rasterized at a fixed width downstream.
export const MAP_WIDTH = 1000;

// Batik (the SVG -> PNG rasterizer) doesn't understand hsl() colors, so normalize every color we emit to
// rgb(). map.colors values in particular can arrive as hsl() (getColorplethColorScale builds them via the
// color lib's HSL operations).
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

function shouldUseCompactFormatting(
  groups: number[][],
  formatMetric: (value: number, compact: boolean) => string,
): boolean {
  const minValues = groups.map(([x]) => x);
  const maxValues = groups.slice(0, -1).map((group) => group[group.length - 1]);
  const allValues = minValues.concat(maxValues);
  const formattedValues = allValues.map((value) => formatMetric(value, false));
  const averageLength =
    formattedValues.reduce((sum, { length }) => sum + length, 0) /
    formattedValues.length;
  return averageLength > AVERAGE_LENGTH_CUTOFF;
}

export function getLegendTitles(
  groups: number[][],
  columnSettings: Record<string, unknown>,
): string[] {
  const formatMetric = (value: number, compact: boolean): string =>
    String(formatValue(value, { ...columnSettings, compact }));

  const compact = shouldUseCompactFormatting(groups, formatMetric);

  return groups.map((group, index) => {
    const min = formatMetric(group[0], compact);
    const max = formatMetric(group[group.length - 1], compact);
    return index === groups.length - 1
      ? `${min} +`
      : min !== max
        ? `${min} - ${max}`
        : min;
  });
}
