import { DEFAULT_CARD_SIZE, GRID_WIDTH } from "metabase/lib/dashboard_grid";
import { measureText } from "metabase/lib/measure-text";

interface FindSizeInput {
  text: string;
  targetHeight: number;
  targetWidth: number;
  unit: string;
  fontFamily: string;
  fontWeight: string | number;
  step: number;
  min: number;
  max: number;
}

export const findSize = ({
  text,
  targetHeight,
  targetWidth,
  unit,
  fontFamily,
  fontWeight,
  step: _step,
  min,
  max,
}: FindSizeInput) => {
  const size = max;

  // Convert to pixels for 8px step calculation
  const sizePx = typeof size === "string" ? parseFloat(size) * 16 : size * 16;
  const minPx = typeof min === "string" ? parseFloat(min) * 16 : min * 16;

  // Start with the maximum size, rounded down to nearest 8px multiple
  let currentPx = Math.floor(sizePx / 8) * 8;

  let metrics = measureText(text, {
    size: `${currentPx}px`,
    family: fontFamily,
    weight: fontWeight,
  });

  // Reduce size by 8px increments until text fits within bounds
  while (
    (metrics.width > targetWidth || metrics.height > targetHeight) &&
    currentPx > minPx
  ) {
    currentPx = Math.max(currentPx - 8, minPx);

    metrics = measureText(text, {
      size: `${currentPx}px`,
      family: fontFamily,
      weight: fontWeight,
    });
  }

  // Convert back to the requested unit
  return unit === "rem" ? `${currentPx / 16}rem` : `${currentPx}px`;
};

const MAX_SIZE_SMALL = 2.2;
const MAX_SIZE_LARGE = 7;

export const getMaxFontSize = (
  cardColWidth: number,
  totalCols: number | undefined,
  cardWidth: number | undefined,
  cardRowHeight?: number,
) => {
  if (totalCols != null && totalCols < DEFAULT_CARD_SIZE.width) {
    return MAX_SIZE_SMALL;
  }

  // Base size calculation from width (existing logic)
  const baseSize =
    (cardColWidth / GRID_WIDTH) * (MAX_SIZE_LARGE - MAX_SIZE_SMALL) +
    MAX_SIZE_SMALL;

  // Determine max font size based on width
  // Exact progression as specified, then 0.25rem increments beyond 7 units, capped at 7rem
  const widthBasedSizes: Record<number, number> = {
    2: 1.25,
    3: 1.5,
    4: 2,
    5: 2.25,
    6: 2.5,
    7: 2.75,
  };

  let maxSizeRem = widthBasedSizes[cardColWidth];
  if (maxSizeRem == null) {
    // For 8+ units wide, continue with 0.25rem increments from 7 units (2.75rem)
    maxSizeRem = Math.min(2.75 + (cardColWidth - 7) * 0.25, 7);
  }

  // Apply height-based constraints on top of width-based limits
  if (cardRowHeight != null && cardRowHeight <= 2) {
    // 2-unit tall cards can't exceed 2.5rem regardless of width
    maxSizeRem = Math.min(maxSizeRem, 2.5);
  } else if (cardRowHeight === 3) {
    // 3-unit tall cards can't exceed 5rem regardless of width
    maxSizeRem = Math.min(maxSizeRem, 5);
  }

  const finalSize = Math.min(baseSize, maxSizeRem);

  return finalSize;
};
