export interface ScalarSizeTier {
  minWidth: number;
  minHeight: number;
  xPadding: number;
  valueFontSize: number;
  valueTitleGap: number;
  symbolSize: number;
  symbolGap: number;
  comparisonGap: number;
  menuOffset: { top: number; right: number };
  showsTitle: boolean;
  skeleton: { valueWidth: number; valueHeight: number; titleWidth: number };
}

const SMALL_MENU_OFFSET = { top: 12, right: 16 };
const LARGE_MENU_OFFSET = { top: 22, right: 24 };

// Largest tier first; a card gets the first tier it fits both dimensions of.
// Values come from the "Charts visual improvements" Figma spec (node 314-478);
// skeleton pill sizes come from the loading states spec (node 431-1518).
export const SCALAR_SIZE_TIERS: readonly ScalarSizeTier[] = [
  {
    minWidth: 600,
    minHeight: 320,
    xPadding: 48,
    valueFontSize: 64,
    valueTitleGap: 32,
    symbolSize: 24,
    symbolGap: 20,
    comparisonGap: 12,
    menuOffset: LARGE_MENU_OFFSET,
    showsTitle: true,
    skeleton: { valueWidth: 200, valueHeight: 32, titleWidth: 256 },
  },
  {
    minWidth: 500,
    minHeight: 240,
    xPadding: 40,
    valueFontSize: 56,
    valueTitleGap: 24,
    symbolSize: 20,
    symbolGap: 16,
    comparisonGap: 12,
    menuOffset: LARGE_MENU_OFFSET,
    showsTitle: true,
    skeleton: { valueWidth: 160, valueHeight: 32, titleWidth: 256 },
  },
  {
    minWidth: 400,
    minHeight: 200,
    xPadding: 32,
    valueFontSize: 48,
    valueTitleGap: 16,
    symbolSize: 20,
    symbolGap: 16,
    comparisonGap: 8,
    menuOffset: LARGE_MENU_OFFSET,
    showsTitle: true,
    skeleton: { valueWidth: 96, valueHeight: 32, titleWidth: 128 },
  },
  {
    minWidth: 320,
    minHeight: 160,
    xPadding: 24,
    valueFontSize: 40,
    valueTitleGap: 16,
    symbolSize: 16,
    symbolGap: 12,
    comparisonGap: 8,
    menuOffset: SMALL_MENU_OFFSET,
    showsTitle: true,
    skeleton: { valueWidth: 72, valueHeight: 24, titleWidth: 128 },
  },
  {
    minWidth: 160,
    minHeight: 120,
    xPadding: 24,
    valueFontSize: 32,
    valueTitleGap: 12,
    symbolSize: 16,
    symbolGap: 8,
    comparisonGap: 6,
    menuOffset: SMALL_MENU_OFFSET,
    showsTitle: true,
    skeleton: { valueWidth: 72, valueHeight: 24, titleWidth: 128 },
  },
  {
    minWidth: 0,
    minHeight: 0,
    xPadding: 8,
    valueFontSize: 17,
    valueTitleGap: 6,
    symbolSize: 12,
    symbolGap: 6,
    comparisonGap: 6,
    menuOffset: SMALL_MENU_OFFSET,
    showsTitle: false,
    skeleton: { valueWidth: 40, valueHeight: 17, titleWidth: 128 },
  },
];

export const getScalarSizeTier = (
  width: number,
  height: number,
): ScalarSizeTier => {
  const tier = SCALAR_SIZE_TIERS.find(
    (tier) => width >= tier.minWidth && height >= tier.minHeight,
  );
  return tier ?? SCALAR_SIZE_TIERS[SCALAR_SIZE_TIERS.length - 1];
};
