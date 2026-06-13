import Color from "color";

const NODE_LABEL_TEXT_SHADOW_COLOR = Color("black").alpha(0.5).rgb().string();

export const LABEL_PADDING = 12;

export const TREEMAP_CHART_STYLE = {
  nodeLabels: {
    fontWeight: 700,
    size: 12,
    textBorderWidth: 3,
    position: [LABEL_PADDING, LABEL_PADDING],
    fontFamily: "Lato, sans-serif",
    textShadowColor: NODE_LABEL_TEXT_SHADOW_COLOR,
    textShadowBlur: 4,
    textShadowOffsetX: 0,
    textShadowOffsetY: 0,
  },
};

export const groupHeader = {
  fontWeight: 700,
  fontSize: 12,
  height: 32,
  paddingX: 12,
  percentFontWeight: 400,
  valuePercentGap: 8,
} as const;

export const leafBlock = {
  name: { fontSize: 12, fontWeight: 700, height: 16 },
  value: { fontSize: 20, fontWeight: 700, height: 24 },
  percent: { fontSize: 12, fontWeight: 400, height: 16 },
  valueGap: 16,
  percentGap: 8,
} as const;

export const GROUP_HEADER_BG_TINT = 0.4;

export function getGroupHeaderBgTint(
  groupColor: string | undefined,
  headerTintTarget: string,
) {
  if (!groupColor) {
    return undefined;
  }

  return Color(groupColor)
    .mix(Color(headerTintTarget), 1 - GROUP_HEADER_BG_TINT)
    .string();
}

const PADDING_COMPACT = 24;

export function getChartPadding(isCompact: boolean) {
  return isCompact ? PADDING_COMPACT : `1rem 2rem 2rem 2rem`;
}

export const TREEMAP_HOVER_OVERLAY_FILL = Color("black")
  .alpha(0.1)
  .rgb()
  .string();

export const HOVER_OVERLAY_Z = 100;
