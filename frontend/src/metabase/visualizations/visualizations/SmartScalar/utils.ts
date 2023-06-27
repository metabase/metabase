import { formatNumber } from "metabase/lib/formatting";
import { measureText } from "metabase/lib/measure-text";

import { TITLE_2_LINES_HEIGHT_THRESHOLD } from "./constants";

export const getTitleLinesCount = (height: number) =>
  height > TITLE_2_LINES_HEIGHT_THRESHOLD ? 2 : 1;

export const formatChangeAutoPrecision = (
  change: number,
  {
    fontFamily,
    fontWeight,
    width,
  }: { fontFamily: string; fontWeight: number; width: number },
): string => {
  for (let fractionDigits = 2; fractionDigits >= 1; --fractionDigits) {
    const formatted = formatChange(change, {
      maximumFractionDigits: fractionDigits,
    });

    const formattedWidth = measureText(formatted, {
      size: "1rem",
      family: fontFamily,
      weight: fontWeight,
    }).width;

    if (formattedWidth <= width) {
      return formatted;
    }
  }

  return formatChange(change, {
    maximumFractionDigits: 0,
  });
};

export const formatChange = (
  change: number,
  { maximumFractionDigits = 2 } = {},
): string =>
  formatNumber(Math.abs(change), {
    number_style: "percent",
    maximumFractionDigits,
  });
