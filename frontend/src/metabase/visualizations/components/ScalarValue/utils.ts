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

  // Convert to pixels for step calculation
  const sizePx = typeof size === "string" ? parseFloat(size) * 16 : size * 16;
  const minPx = typeof min === "string" ? parseFloat(min) * 16 : min * 16;

  // Start with the maximum size
  let currentPx = sizePx;

  let metrics = measureText(text, {
    size: `${currentPx}px`,
    family: fontFamily,
    weight: fontWeight,
  });

  // Reduce size by 1px increments until text fits within bounds
  while (
    (metrics.width > targetWidth || metrics.height > targetHeight) &&
    currentPx > minPx
  ) {
    currentPx = Math.max(currentPx - 1, minPx);

    metrics = measureText(text, {
      size: `${currentPx}px`,
      family: fontFamily,
      weight: fontWeight,
    });
  }

  // Convert back to the requested unit
  return unit === "rem" ? `${currentPx / 16}rem` : `${currentPx}px`;
};

const MAX_SIZE_SMALL = 2.25;
const MAX_SIZE_LARGE = 7.5;

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
    4: 2.25,
    5: 2.5,
    6: 2.75,
    7: 3,
  };

  let maxSizeRem = widthBasedSizes[cardColWidth];
  if (maxSizeRem == null) {
    // For 8+ units wide, continue with 0.25rem increments from 7 units (2.75rem)
    maxSizeRem = Math.min(3 + (cardColWidth - 7) * 0.25, 7);
  }

  // Apply height-based constraints on top of width-based limits
  if (cardRowHeight != null && cardRowHeight <= 2) {
    // 2-unit tall cards can't exceed 2.8rem regardless of width
    maxSizeRem = Math.min(maxSizeRem, 2.8);
  } else if (cardRowHeight === 3) {
    // 3-unit tall cards can't exceed 5rem regardless of width
    maxSizeRem = Math.min(maxSizeRem, 5);
  }

  // Apply height bonus for cards taller than 3 units (after height constraints)
  if (cardRowHeight != null && cardRowHeight > 2) {
    const heightBonus = (cardRowHeight - 2) * 0.25;
    maxSizeRem += heightBonus;
  }

  // Final cap at 7rem maximum
  maxSizeRem = Math.min(maxSizeRem, 7);

  // Apply height constraints to baseSize as well for consistency
  let constrainedBaseSize = baseSize;
  if (cardRowHeight != null && cardRowHeight <= 2) {
    constrainedBaseSize = Math.min(baseSize, 2.5);
  } else if (cardRowHeight === 3) {
    constrainedBaseSize = Math.min(baseSize, 5);
  }

  // Create a graceful transition between baseSize constraint and maxSizeRem
  // For narrow cards (2-6 units), use baseSize as primary constraint
  // For very wide cards (9+ units), use maxSizeRem as primary size
  // For medium cards (7-8 units), blend between the two approaches
  let finalSize;
  if (cardColWidth <= 6) {
    // Narrow cards: constrainedBaseSize is the primary constraint
    finalSize = Math.min(constrainedBaseSize, maxSizeRem);
  } else if (cardColWidth >= 9) {
    // Very wide cards: maxSizeRem is the primary size (allows height bonuses)
    finalSize = maxSizeRem;
  } else {
    // Medium cards (7-8 units): blend between constrainedBaseSize and maxSizeRem
    // At 7 units: 100% constrainedBaseSize constraint, 0% maxSizeRem
    // At 8 units: 0% constrainedBaseSize constraint, 100% maxSizeRem
    const blendFactor = cardColWidth - 7; // 0 at 7 units, 1 at 8 units
    const baseSizeComponent = constrainedBaseSize * (1 - blendFactor);
    const maxSizeComponent = maxSizeRem * blendFactor;
    finalSize = Math.min(baseSizeComponent + maxSizeComponent, maxSizeRem);
  }

  return finalSize;
};
