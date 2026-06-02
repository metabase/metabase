import Color from "color";
import { geoAlbersUsa, geoMercator, geoPath, scaleThreshold } from "d3";
import type { Feature, FeatureCollection } from "geojson";
import ss from "simple-statistics";

import { formatValue } from "metabase/visualizations/lib/formatting";
import { getCanonicalRowKey } from "metabase/visualizations/lib/region-codes";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import {
  isCountry,
  isDimension,
  isMetric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type { GeoJSONData, RawSeries, RowValue } from "metabase-types/api";

// Kept in sync with the runtime ChoroplethMap. We intentionally do not import from there because that
// module pulls in Leaflet, which cannot load in the static-viz (GraalJS, no-DOM) bundle.
// eslint-disable-next-line metabase/no-color-literals
const HEAT_MAP_COLORS = ["#C4E4FF", "#81C5FF", "#51AEFF", "#1E96FF", "#0061B5"];
// eslint-disable-next-line metabase/no-color-literals
const HEAT_MAP_ZERO_COLOR = "#CCC";

// if the average formatted length is greater than this, we switch to compact formatting
const AVERAGE_LENGTH_CUTOFF = 5;

// Batik (the SVG -> PNG rasterizer) doesn't understand hsl() colors, so normalize every color we emit to
// rgb(). map.colors values in particular can arrive as hsl() (getColorplethColorScale builds them via the
// color lib's HSL operations).
const toRgb = (color: string): string => Color(color).rgb().string();

type GeoJSONDetails = {
  region_key: string;
  region_name: string;
};

export interface StaticChoroplethProps {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  geoJson: GeoJSONData;
  geoJsonDetails: GeoJSONDetails;
  renderingContext: RenderingContext;
}

function isFeatureCollection(value: GeoJSONData): value is FeatureCollection {
  return value.type === "FeatureCollection";
}

function getFeatures(geoJson: GeoJSONData): Feature[] {
  return isFeatureCollection(geoJson) ? geoJson.features : [geoJson];
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

function getLegendTitles(
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

export const StaticChoropleth = ({
  rawSeries,
  settings,
  geoJson,
  geoJsonDetails,
  renderingContext,
}: StaticChoroplethProps) => {
  const [
    {
      data: { cols, rows },
    },
  ] = rawSeries;

  const region = settings["map.region"];
  // Fall back to the same defaults the live Map visualization computes, since a subscription card may
  // not have these settings persisted (the backend pins map.region for us).
  const dimensionName =
    settings["map.dimension"] ??
    cols.find((col) => isCountry(col) || isState(col))?.name ??
    cols.find(isDimension)?.name;
  const metricName = settings["map.metric"] ?? cols.find(isMetric)?.name;
  const dimensionIndex = cols.findIndex((col) => col.name === dimensionName);
  const metricIndex = cols.findIndex((col) => col.name === metricName);

  // Built-in regions only — these are the two maps we can render server-side (see detect-pulse-chart-type).
  const projection = region === "us_states" ? geoAlbersUsa() : geoMercator();
  const projectionFrame: [[number, number], [number, number]] =
    region === "us_states"
      ? [
          [-135.0, 46.6],
          [-69.1, 21.7],
        ]
      : [
          [-170, 78],
          [180, -60],
        ];

  const keyProperty = geoJsonDetails.region_key;

  const getRowKey = (row: RowValue[]): string =>
    getCanonicalRowKey(row[dimensionIndex], region);
  const getRowValue = (row: RowValue[]): number => {
    const value = row[metricIndex];
    return typeof value === "number" ? value : 0;
  };
  const getFeatureKey = (feature: Feature): string =>
    String(feature.properties?.[keyProperty]).toLowerCase();

  const valuesMap: Record<string, number> = {};
  for (const row of rows) {
    const key = getRowKey(row);
    valuesMap[key] = (valuesMap[key] || 0) + getRowValue(row);
  }
  const getFeatureValue = (feature: Feature): number | undefined =>
    valuesMap[getFeatureKey(feature)];

  const domain = Array.from(new Set(Object.values(valuesMap)));
  const hasData = domain.length > 0;

  const heatMapColors = (settings["map.colors"] ?? HEAT_MAP_COLORS)
    .slice(-domain.length)
    .map(toRgb);
  const zeroColor = toRgb(HEAT_MAP_ZERO_COLOR);

  // ckmeans requires at least one value and clusters <= values; the slice above guarantees the latter.
  const groups: number[][] = hasData
    ? ss.ckmeans(domain, heatMapColors.length)
    : [];
  const groupBoundaries = groups.slice(1).map((cluster) => cluster[0]);
  const colorScale = scaleThreshold<number, string>()
    .domain(groupBoundaries)
    .range(heatMapColors);

  const getColor = (feature: Feature): string => {
    const value = getFeatureValue(feature);
    return value == null ? zeroColor : colorScale(value);
  };

  const columnSettings =
    (metricIndex >= 0 && settings.column?.(cols[metricIndex])) || {};
  const legendTitles = hasData ? getLegendTitles(groups, columnSettings) : [];

  const geo = geoPath(projection);
  const [[minX, minY], [maxX, maxY]] = projectionFrame.map((coord) => {
    const projected = projection(coord);
    return projected ?? [0, 0];
  }) as [[number, number], [number, number]];
  const mapWidth = maxX - minX;
  const mapHeight = maxY - minY;

  // Legend strip rendered below the map, in the same projected coordinate space.
  const legendGap = mapHeight * 0.04;
  const swatchHeight = mapHeight * 0.045;
  const fontSize = mapHeight * 0.035;
  const legendY = maxY + legendGap;
  const labelY = legendY + swatchHeight + fontSize * 1.2;
  const itemWidth =
    legendTitles.length > 0 ? mapWidth / legendTitles.length : 0;
  const totalHeight = mapHeight + legendGap + swatchHeight + fontSize * 1.6;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={mapWidth}
      height={totalHeight}
      viewBox={`${minX} ${minY} ${mapWidth} ${totalHeight}`}
    >
      <g>
        {getFeatures(geoJson).map((feature, index) => (
          <path
            key={index}
            d={geo(feature) ?? undefined}
            stroke="white"
            strokeWidth={1}
            fill={getColor(feature)}
          />
        ))}
      </g>
      {legendTitles.length > 0 && (
        <g>
          {legendTitles.map((title, index) => {
            const x = minX + index * itemWidth;
            return (
              <g key={index}>
                <rect
                  x={x}
                  y={legendY}
                  width={itemWidth}
                  height={swatchHeight}
                  fill={heatMapColors[index]}
                />
                <text
                  x={x + itemWidth / 2}
                  y={labelY}
                  fontSize={fontSize}
                  fontFamily="Lato, sans-serif"
                  textAnchor="middle"
                  fill={toRgb(renderingContext.getColor("text-secondary"))}
                >
                  {title}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
};
