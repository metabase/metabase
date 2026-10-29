import Color from "color";

export function getHexColor(color: string) {
  // Convert color values to hex format since Apache Batik (SVG renderer used in static visualizations)
  // doesn't support functional color notations like hsla(), rgba(), etc.
  return Color(color).hex();
}
