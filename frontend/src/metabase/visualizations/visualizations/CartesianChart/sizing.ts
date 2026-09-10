import type { LegendCaptionTitleSize } from "metabase/visualizations/components/legend/LegendCaption";

export interface CartesianCardSizeTier {
  minWidth: number;
  minHeight: number;
  xPadding: number;
  yPadding: number;
  titleGap: number;
  titleFontSize: LegendCaptionTitleSize;
}

// Largest tier first; a card gets the first tier it fits both dimensions of.
export const CARTESIAN_CARD_SIZE_TIERS: readonly CartesianCardSizeTier[] = [
  {
    minWidth: 640,
    minHeight: 360,
    xPadding: 40,
    yPadding: 38,
    titleGap: 32,
    titleFontSize: "md",
  },
  {
    minWidth: 300,
    minHeight: 200,
    xPadding: 24,
    yPadding: 22,
    titleGap: 22,
    titleFontSize: "md",
  },
  {
    minWidth: 0,
    minHeight: 0,
    xPadding: 16,
    yPadding: 12,
    titleGap: 12,
    titleFontSize: "sm",
  },
];

export const getCartesianCardSizeTier = (
  width: number,
  height: number,
): CartesianCardSizeTier => {
  const tier = CARTESIAN_CARD_SIZE_TIERS.find(
    (tier) => width >= tier.minWidth && height >= tier.minHeight,
  );
  return (
    tier ?? CARTESIAN_CARD_SIZE_TIERS[CARTESIAN_CARD_SIZE_TIERS.length - 1]
  );
};
