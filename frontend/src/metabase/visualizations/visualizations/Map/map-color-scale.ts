import Color from "color";
import * as d3 from "d3";

// Leaflet-free color-scale helper for the region (choropleth) map. It lives in
// its own module (rather than in ChoroplethMap, which pulls in the leaflet
// renderer) so the Map visualization definition can use it for its settings
// without forcing leaflet into the initial bundle.

type ColorScaleOptions = {
  lightness?: number;
  darken?: number;
  darkenLast?: number;
  saturate?: number;
};

export function getColorplethColorScale(
  color: string,
  {
    lightness = 92,
    darken = 0.2,
    darkenLast = 0.3,
    saturate = 0.1,
  }: ColorScaleOptions = {},
): string[] {
  const lightColor = Color(color).lightness(lightness).saturate(saturate);
  const darkColor = Color(color).darken(darken).saturate(saturate);

  const scale = d3.scaleLinear<string>(
    [0, 1],
    [lightColor.string(), darkColor.string()],
  );

  const colors = d3.range(0, 1.25, 0.25).map((value) => scale(value));

  if (darkenLast) {
    colors[colors.length - 1] = Color(color)
      .darken(darkenLast)
      .saturate(saturate)
      .string();
  }

  return colors;
}
