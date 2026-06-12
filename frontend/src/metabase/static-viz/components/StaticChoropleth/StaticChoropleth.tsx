import { geoAlbersUsa, geoMercator, geoPath } from "d3";
import type { Feature } from "geojson";

import {
  HEAT_MAP_ZERO_COLOR,
  buildColorScale,
  getDefaultMapDimension,
  getDefaultMapMetric,
  getLegendTitles,
} from "metabase/visualizations/lib/choropleth";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { GeoJSONData, RawSeries } from "metabase-types/api";

import {
  MAP_WIDTH,
  getFeatureKey,
  getFeatures,
  getRegionValues,
  toRgb,
} from "./utils";

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
    settings["map.dimension"] ?? getDefaultMapDimension(cols);
  const metricName = settings["map.metric"] ?? getDefaultMapMetric(cols);
  const dimensionIndex = cols.findIndex((col) => col.name === dimensionName);
  const metricIndex = cols.findIndex((col) => col.name === metricName);

  // Albers for the US (its Alaska/Hawaii insets are tuned for it), Mercator otherwise. fitWidth fits the
  // projection to the GeoJSON's own bounds, so any region works (built-in or custom) without a hardcoded frame.
  const projection = (
    region === "us_states" ? geoAlbersUsa() : geoMercator()
  ).fitWidth(MAP_WIDTH, geoJson);

  const keyProperty = geoJsonDetails.region_key;

  const valuesMap = getRegionValues(rows, dimensionIndex, metricIndex, region);
  const getFeatureValue = (feature: Feature): number | undefined =>
    valuesMap[getFeatureKey(feature, keyProperty)];

  const domain = Array.from(new Set(Object.values(valuesMap)));
  const hasData = domain.length > 0;
  // HEAT_MAP_ZERO_COLOR is already hex (Batik-safe); only map.colors below needs the hsl()->rgb() pass.
  const zeroColor = HEAT_MAP_ZERO_COLOR;

  // buildColorScale runs ckmeans, which needs a non-empty domain — guard the no-data case so every
  // feature falls to zeroColor.
  const { colorScale, groups, heatMapColors } = hasData
    ? buildColorScale(domain, settings["map.colors"], toRgb)
    : {
        colorScale: (_value: number) => zeroColor,
        groups: [] as number[][],
        heatMapColors: [] as string[],
      };

  const getColor = (feature: Feature): string => {
    const value = getFeatureValue(feature);
    return value == null ? zeroColor : colorScale(value);
  };

  const columnSettings =
    (metricIndex >= 0 && settings.column?.(cols[metricIndex])) || {};
  const legendTitles = hasData ? getLegendTitles(groups, columnSettings) : [];

  const geo = geoPath(projection);
  const [[minX, minY], [maxX, maxY]] = geo.bounds(geoJson);
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
                  fill={renderingContext.getColor("text-secondary")}
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
