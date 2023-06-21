import { GRID_WIDTH, DEFAULT_CARD_SIZE } from "metabase/lib/dashboard_grid";
import { measureText } from "metabase/lib/measure-text";

interface FindSizeInput {
  text: string;
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
  targetWidth,
  unit,
  fontFamily,
  fontWeight,
  step,
  min,
  max,
}: FindSizeInput) => {
  let size = max;
  let { width } = measureText(text, {
    size: `${size}${unit}`,
    family: fontFamily,
    weight: fontWeight,
  });

  if (width > targetWidth) {
    while (width > targetWidth && size > min) {
      size = Math.max(size - step, min);

      width = measureText(text, {
        size: `${size}${unit}`,
        family: fontFamily,
        weight: fontWeight,
      }).width;
    }

    return `${size}${unit}`;
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
