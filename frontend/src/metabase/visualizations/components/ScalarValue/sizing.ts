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
}

const SMALL_MENU_OFFSET = { top: 12, right: 16 };
const LARGE_MENU_OFFSET = { top: 22, right: 24 };

// Largest tier first; a card gets the first tier it fits both dimensions of.
// Values come from the "Charts visual improvements" Figma spec (node 314-478).
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
