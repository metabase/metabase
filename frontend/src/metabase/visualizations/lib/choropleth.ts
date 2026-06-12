import * as d3 from "d3";
import ss from "simple-statistics";

import { formatValue } from "metabase/visualizations/lib/formatting";
import type { ColumnSettings } from "metabase/visualizations/types";
import {
  isCountry,
  isDimension,
  isMetric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

// Shared choropleth (region map) helpers, kept Leaflet-free (unlike the runtime ChoroplethMap) so the
// static-viz bundle — which runs in GraalJS where Leaflet can't load — can use them too.
export function getDefaultMapDimension(
  cols: DatasetColumn[],
): string | undefined {
  const geoDimension = cols.find((col) => isCountry(col) || isState(col));
  return geoDimension?.name ?? cols.find(isDimension)?.name;
}

export function getDefaultMapMetric(cols: DatasetColumn[]): string | undefined {
  return cols.find(isMetric)?.name;
}

/* eslint-disable metabase/no-color-literals */
export const HEAT_MAP_COLORS = [
  "#C4E4FF",
  "#81C5FF",
  "#51AEFF",
  "#1E96FF",
  "#0061B5",
];
export const HEAT_MAP_ZERO_COLOR = "#CCC";
/* eslint-enable metabase/no-color-literals */

// if the average formatted length is greater than this, we switch to compact formatting
const AVERAGE_LENGTH_CUTOFF = 5;

// `transformColor` is applied to every emitted color; defaults to identity. The static-viz renderer
// passes a hsl()->rgb() converter because its rasterizer can't parse hsl() (see toRgb).
export function buildColorScale(
  domain: number[],
  settingsColors: string[] | undefined,
  transformColor: (color: string) => string = (color) => color,
): {
  colorScale: (value: number) => string;
  groups: number[][];
  heatMapColors: string[];
} {
  const heatMapColors = (settingsColors ?? HEAT_MAP_COLORS)
    .slice(-domain.length)
    .map(transformColor);

  const groups = ss.ckmeans(domain, heatMapColors.length);
  const groupBoundaries = groups.slice(1).map((cluster) => cluster[0]);

  const colorScale = d3
    .scaleThreshold<number, string>()
    .domain(groupBoundaries)
    .range(heatMapColors);

  return { colorScale, groups, heatMapColors };
}

export function getLegendTitles(
  groups: number[][],
  columnSettings: ColumnSettings,
): string[] {
  const formatMetric = (value: number, compact: boolean): string =>
    String(formatValue(value, { ...columnSettings, compact }));

  const compact = shouldUseCompactFormatting(groups, formatMetric);

  return groups.map((group, index) => {
    const min = formatMetric(group[0], compact);
    const max = formatMetric(group[group.length - 1], compact);
    return index === groups.length - 1
      ? `${min} +` // the last value in the list
      : min !== max
        ? `${min} - ${max}` // typical case
        : min; // special case to avoid zero-width ranges e.g. $88-$88
  });
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
