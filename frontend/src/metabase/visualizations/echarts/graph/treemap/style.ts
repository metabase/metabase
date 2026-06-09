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
  // The right-aligned cluster: value (bold, like the name) + percentage
  // (regular, secondary). `valuePercentGap` is the gap (px) between the value
  // and the percentage within the cluster (Figma node 193:488).
  percentFontWeight: 400,
  valuePercentGap: 8,
} as const;

/**
 * Fonts and gaps for the inline "full" tile block — name / value / percentage
 * stacked inside a leaf tile when it's big enough (per Figma node 193:456). The
 * name matches the name-only label (bold 12); the value is the H3 style (bold
 * 20); the percentage is regular 12. `valueGap`/`percentGap` are the vertical
 * gaps (px) above the value and percentage lines. The gaps + line heights + the
 * `position` insets add up to `MIN_FULL_LABEL_TILE_HEIGHT` in `model/labels.ts`.
 */
export const leafBlock = {
  name: { fontSize: 12, fontWeight: 700, lineHeight: 16 },
  value: { fontSize: 20, fontWeight: 700, lineHeight: 24 },
  percent: { fontSize: 12, fontWeight: 400, lineHeight: 16 },
  valueGap: 12,
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
