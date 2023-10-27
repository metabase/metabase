import { DEFAULT_CARD_SIZE, GRID_WIDTH } from "metabase/lib/dashboard_grid";
import { measureText } from "metabase/lib/measure-text";

interface FindSizeInput {
  text: string;
  targetHeight: number;
  targetWidth: number;
  unit: string;
  fontFamily: string;
  fontWeight: string;
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
  step,
  min,
  max,
}: FindSizeInput) => {
  let size = max;
  let metrics = measureText(text, {
    size: `${size}${unit}`,
    family: fontFamily,
    weight: fontWeight,
  });

  while (
    (metrics.width > targetWidth || metrics.height > targetHeight) &&
    size > min
  ) {
    size = Math.max(size - step, min);

    metrics = measureText(text, {
      size: `${size}${unit}`,
      family: fontFamily,
      weight: fontWeight,
    });
  }

  return `${size}${unit}`;
};

const MAX_SIZE_SMALL = 2.2;
const MAX_SIZE_LARGE = 7;

export const getMaxFontSize = (cardColWidth: number, totalCols: number) => {
  if (totalCols < DEFAULT_CARD_SIZE.width) {
    return MAX_SIZE_SMALL;
  }

  return (
    (cardColWidth / GRID_WIDTH) * (MAX_SIZE_LARGE - MAX_SIZE_SMALL) +
    MAX_SIZE_SMALL
  );
};
