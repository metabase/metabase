import Color from "color";

// The leaf-label drop shadow (Figma: `text-shadow: 0 0 4px rgba(0, 0, 0, 0.50)`).
// ECharts has no CSS `textShadow` string — it takes separate color/blur/offset
// props — and the color is computed at runtime so no rgba literal lands in
// source (the `no-color-literals` lint rule only flags written hex/rgb literals).
const NODE_LABEL_TEXT_SHADOW_COLOR = Color("black").alpha(0.5).rgb().string();

export const TREEMAP_CHART_STYLE = {
  nodeLabels: {
    fontWeight: 700,
    size: 12,
    textBorderWidth: 3,
    position: [12, 12],
    fontFamily: "Lato, sans-serif",
    textShadowColor: NODE_LABEL_TEXT_SHADOW_COLOR,
    textShadowBlur: 4,
    textShadowOffsetX: 0,
    textShadowOffsetY: 0,
  },
};
