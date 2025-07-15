import { DEFAULT_CARD_SIZE, GRID_WIDTH } from "metabase/lib/dashboard_grid";
import { rem } from "metabase/ui";
import type { VisualizationGridSize } from "metabase/visualizations/types/visualization";

interface FindSizeInput {
  gridSize?: VisualizationGridSize;
}

const defaultFontSize = rem(18);
const matchers: { fontSize: string; minSize: [number, number] }[] = [
  { fontSize: rem(80), minSize: [24, 6] },
  { fontSize: rem(72), minSize: [20, 5] },
  { fontSize: rem(56), minSize: [16, 5] },
  { fontSize: rem(42), minSize: [10, 4] },
  { fontSize: rem(36), minSize: [6, 4] },
  { fontSize: rem(27), minSize: [4, 3] },
  { fontSize: rem(21), minSize: [3, 2] },
];

export const findSize = ({ gridSize }: FindSizeInput): string => {
  if (!gridSize) {
    return defaultFontSize;
  }
  const matcher = matchers.find((m) => {
    return gridSize.width >= m.minSize[0] && gridSize.height >= m.minSize[1];
  });

  return matcher?.fontSize || defaultFontSize;
};

const MAX_SIZE_SMALL = 2.2;
const MAX_SIZE_LARGE = 7;

export const getMaxFontSize = (cardColWidth: number, totalCols?: number) => {
  if (totalCols != null && totalCols < DEFAULT_CARD_SIZE.width) {
    return MAX_SIZE_SMALL;
  }

  return (
    (cardColWidth / GRID_WIDTH) * (MAX_SIZE_LARGE - MAX_SIZE_SMALL) +
    MAX_SIZE_SMALL
  );
};
