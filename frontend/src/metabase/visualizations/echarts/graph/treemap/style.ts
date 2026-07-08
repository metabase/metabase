import Color from "color";

export const LABEL_PADDING = 12;

export const TREEMAP_CHART_STYLE = {
  nodeLabels: {
    fontWeight: 700,
    size: 12,
    position: [LABEL_PADDING, LABEL_PADDING],
    fontFamily: "Lato, sans-serif",
  },
};

export const groupHeader = {
  fontWeight: 700,
  fontSize: 12,
  height: 32,
  compactHeight: 24,
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

export function getChartPadding(isDashboard: boolean) {
  const side = isDashboard ? "1rem" : "2rem";
  return `0 ${side} ${side} ${side}`;
}

export const TREEMAP_HOVER_OVERLAY_FILL = Color("black")
  .alpha(0.1)
  .rgb()
  .string();

export const HOVER_OVERLAY_Z = 100;
