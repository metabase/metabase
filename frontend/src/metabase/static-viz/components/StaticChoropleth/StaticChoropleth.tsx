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

// "bottom": a horizontal swatch strip under the map. "side": a vertical legend to the left, matching
// the wide-card layout the live ChoroplethMap uses (LegendVertical).
type LegendPosition = "bottom" | "side";

export interface StaticChoroplethProps {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  geoJson: GeoJSONData;
  geoJsonDetails: GeoJSONDetails;
  renderingContext: RenderingContext;
  legendPosition?: LegendPosition;
}

export const StaticChoropleth = ({
  rawSeries,
  settings,
  geoJson,
  geoJsonDetails,
  renderingContext,
  legendPosition = "bottom",
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
  const bounds: MapBounds = { minX, minY, maxX, maxY };
  const mapWidth = maxX - minX;
  const mapHeight = maxY - minY;

  const fontColor = renderingContext.getColor("text-secondary");
  const features = (
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
  );

  const hasLegend = legendTitles.length > 0;

  // Vertical legend to the left of the map: widen the viewBox leftward so the swatch column sits beside
  // the (unmoved) map in the same projected coordinate space.
  if (legendPosition === "side" && hasLegend) {
    const legendWidth = mapWidth * 0.34;
    const totalWidth = mapWidth + legendWidth;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={totalWidth}
        height={mapHeight}
        viewBox={`${minX - legendWidth} ${minY} ${totalWidth} ${mapHeight}`}
      >
        {features}
        <SideLegend
          titles={legendTitles}
          colors={heatMapColors}
          fontColor={fontColor}
          bounds={bounds}
          legendWidth={legendWidth}
        />
      </svg>
    );
  }

  const legendGap = mapHeight * 0.04;
  const swatchHeight = mapHeight * 0.045;
  const fontSize = mapHeight * 0.035;
  const totalHeight = mapHeight + legendGap + swatchHeight + fontSize * 1.6;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={mapWidth}
      height={totalHeight}
      viewBox={`${minX} ${minY} ${mapWidth} ${totalHeight}`}
    >
      {features}
      {hasLegend && (
        <BottomLegend
          titles={legendTitles}
          colors={heatMapColors}
          fontColor={fontColor}
          bounds={bounds}
        />
      )}
    </svg>
  );
};

type MapBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type LegendProps = {
  titles: string[];
  colors: string[];
  fontColor: string;
  bounds: MapBounds;
};

// Horizontal swatch strip below the map: one equal-width swatch per bin, label centered beneath it.
const BottomLegend = ({ titles, colors, fontColor, bounds }: LegendProps) => {
  const { minX, maxY } = bounds;
  const mapWidth = bounds.maxX - minX;
  const mapHeight = maxY - bounds.minY;
  const swatchHeight = mapHeight * 0.045;
  const fontSize = mapHeight * 0.035;
  const legendY = maxY + mapHeight * 0.04;
  const labelY = legendY + swatchHeight + fontSize * 1.2;
  const itemWidth = mapWidth / titles.length;

  return (
    <g>
      {titles.map((title, index) => {
        const x = minX + index * itemWidth;
        return (
          <g key={index}>
            <rect
              x={x}
              y={legendY}
              width={itemWidth}
              height={swatchHeight}
              fill={colors[index]}
            />
            <text
              x={x + itemWidth / 2}
              y={labelY}
              fontSize={fontSize}
              fontFamily="Lato, sans-serif"
              textAnchor="middle"
              fill={fontColor}
            >
              {title}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// Vertical legend column left of the map: a small swatch per bin with its label to the right, stacked
// and centered against the map's height. Batik ignores dominant-baseline, so the label baseline is
// offset manually to vertically center it against the swatch.
const SideLegend = ({
  titles,
  colors,
  fontColor,
  bounds,
  legendWidth,
}: LegendProps & { legendWidth: number }) => {
  const { minX, minY } = bounds;
  const mapHeight = bounds.maxY - minY;
  const fontSize = mapHeight * 0.042;
  const rowHeight = mapHeight * 0.09;
  const swatchSize = fontSize * 1.1;
  const gap = fontSize * 0.6;
  const swatchX = minX - legendWidth + fontSize * 0.4;
  const top = minY + (mapHeight - titles.length * rowHeight) / 2;

  return (
    <g>
      {titles.map((title, index) => {
        const rowY = top + index * rowHeight;
        return (
          <g key={index}>
            <rect
              x={swatchX}
              y={rowY}
              width={swatchSize}
              height={swatchSize}
              fill={colors[index]}
            />
            <text
              x={swatchX + swatchSize + gap}
              y={rowY + swatchSize / 2 + fontSize * 0.35}
              fontSize={fontSize}
              fontFamily="Lato, sans-serif"
              textAnchor="start"
              fill={fontColor}
            >
              {title}
            </text>
          </g>
        );
      })}
    </g>
  );
};
