import Color from "color";

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

export const groupHeader = {
  fontWeight: 700,
  fontSize: 12,
  height: 32,
  paddingX: 12,
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
