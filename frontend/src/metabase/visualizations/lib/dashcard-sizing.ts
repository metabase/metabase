import type { LegendCaptionTitleSize } from "metabase/visualizations/components/legend/LegendCaption";

export interface DashcardSizeTier {
  minWidth: number;
  minHeight: number;
  xPadding: number;
  yPadding: number;
  titleGap: number;
  titleFontSize: LegendCaptionTitleSize;
}

// Largest tier first; a card gets the first tier it fits both dimensions of.
export const DASHCARD_SIZE_TIERS: readonly DashcardSizeTier[] = [
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

export const getDashcardSizeTier = (
  width: number,
  height: number,
): DashcardSizeTier => {
  const tier = DASHCARD_SIZE_TIERS.find(
    (tier) => width >= tier.minWidth && height >= tier.minHeight,
  );
  return tier ?? DASHCARD_SIZE_TIERS[DASHCARD_SIZE_TIERS.length - 1];
};

const pxToRem = (px: number) => `${px / 16}rem`;

export const getSizeTierPadding = (sizeTier: DashcardSizeTier) =>
  `${pxToRem(sizeTier.yPadding)} ${pxToRem(sizeTier.xPadding)}`;

export const getSizeTierTitleGap = (sizeTier: DashcardSizeTier) =>
  pxToRem(sizeTier.titleGap);

/** Card padding plus the title gap below, for a header above the chart body. */
export const getSizeTierHeaderPadding = (sizeTier: DashcardSizeTier) =>
  `${pxToRem(sizeTier.yPadding)} ${pxToRem(sizeTier.xPadding)} ${pxToRem(sizeTier.titleGap)}`;

/** Chart body inset below a header, or the full card padding without one. */
export const getSizeTierBodyPadding = (
  sizeTier: DashcardSizeTier,
  hasHeader: boolean,
) =>
  hasHeader
    ? `0 ${pxToRem(sizeTier.xPadding)} ${pxToRem(sizeTier.yPadding)}`
    : getSizeTierPadding(sizeTier);
