export interface ScalarSizeTier {
  size: 100 | 150 | 200 | 300 | 400 | 500 | 600;
  minWidth: number;
  minHeight: number;
  xPadding: number;
  valueFontSize: number;
  valueTitleGap: number;
  symbolSize: number;
  symbolGap: number;
  comparisonGap: number;
  multiComparisonMinHeight: number | null;
  menuOffset: { top: number; right: number };
  skeleton: { valueWidth: number; valueHeight: number; titleWidth: number };
}

const SMALL_MENU_OFFSET = { top: 12, right: 16 };
const LARGE_MENU_OFFSET = { top: 22, right: 24 };

// Largest tier first; both measured dimensions must fit.
// Values come from the "Charts visual improvements" Figma specs (nodes 314-478 and 915-2038);
// skeleton pill sizes come from the loading states spec (node 431-1518) and
// the multiple-comparison heights from the Trend card spec (node 528-2394).
export const SCALAR_SIZE_TIERS: readonly ScalarSizeTier[] = [
  {
    size: 600,
    minWidth: 600,
    minHeight: 320,
    xPadding: 48,
    valueFontSize: 64,
    valueTitleGap: 32,
    symbolSize: 24,
    symbolGap: 20,
    comparisonGap: 12,
    multiComparisonMinHeight: 320,
    menuOffset: LARGE_MENU_OFFSET,
    skeleton: { valueWidth: 200, valueHeight: 32, titleWidth: 256 },
  },
  {
    size: 500,
    minWidth: 500,
    minHeight: 240,
    xPadding: 40,
    valueFontSize: 56,
    valueTitleGap: 24,
    symbolSize: 20,
    symbolGap: 16,
    comparisonGap: 12,
    multiComparisonMinHeight: 288,
    menuOffset: LARGE_MENU_OFFSET,
    skeleton: { valueWidth: 160, valueHeight: 32, titleWidth: 256 },
  },
  {
    size: 400,
    minWidth: 400,
    minHeight: 200,
    xPadding: 32,
    valueFontSize: 48,
    valueTitleGap: 16,
    symbolSize: 20,
    symbolGap: 16,
    comparisonGap: 8,
    multiComparisonMinHeight: 264,
    menuOffset: LARGE_MENU_OFFSET,
    skeleton: { valueWidth: 96, valueHeight: 32, titleWidth: 128 },
  },
  {
    size: 300,
    minWidth: 320,
    minHeight: 160,
    xPadding: 24,
    valueFontSize: 40,
    valueTitleGap: 16,
    symbolSize: 16,
    symbolGap: 12,
    comparisonGap: 8,
    multiComparisonMinHeight: 256,
    menuOffset: SMALL_MENU_OFFSET,
    skeleton: { valueWidth: 72, valueHeight: 24, titleWidth: 128 },
  },
  {
    size: 200,
    minWidth: 160,
    minHeight: 120,
    xPadding: 24,
    valueFontSize: 32,
    valueTitleGap: 12,
    symbolSize: 16,
    symbolGap: 8,
    comparisonGap: 6,
    multiComparisonMinHeight: 240,
    menuOffset: SMALL_MENU_OFFSET,
    skeleton: { valueWidth: 72, valueHeight: 24, titleWidth: 128 },
  },
  {
    size: 150,
    minWidth: 120,
    minHeight: 64,
    xPadding: 8,
    valueFontSize: 21,
    valueTitleGap: 8,
    symbolSize: 12,
    symbolGap: 6,
    comparisonGap: 6,
    multiComparisonMinHeight: null,
    menuOffset: SMALL_MENU_OFFSET,
    skeleton: { valueWidth: 40, valueHeight: 21, titleWidth: 72 },
  },
  {
    size: 100,
    minWidth: 0,
    minHeight: 0,
    xPadding: 8,
    valueFontSize: 17,
    valueTitleGap: 6,
    symbolSize: 12,
    symbolGap: 6,
    comparisonGap: 6,
    multiComparisonMinHeight: null,
    menuOffset: SMALL_MENU_OFFSET,
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
