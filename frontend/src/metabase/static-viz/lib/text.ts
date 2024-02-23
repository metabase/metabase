import { init } from "server-text-width";

import { CHAR_SIZES, CHAR_SIZES_FONT_SIZE } from "../constants/char-sizes";

const CHAR_ELLIPSES = "…";
const DEFAULT_FONT_WEIGHT = 400;

export const { getTextWidth } = init(CHAR_SIZES);

export const measureTextWidth = (
  text: string,
  fontSize: number,
  fontWeight = DEFAULT_FONT_WEIGHT,
) => {
  const sizeFactor = fontSize / CHAR_SIZES_FONT_SIZE;

  const baseWidth = getTextWidth(text, {
    fontSize: `${CHAR_SIZES_FONT_SIZE}px`,
    fontWeight: fontWeight.toString(),
  });

  return sizeFactor * baseWidth;
};

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.3;
};

export const truncateText = (
  text: string,
  width: number,
  fontSize: number,
  fontWeight = DEFAULT_FONT_WEIGHT,
) => {
  if (measureTextWidth(text, fontSize, fontWeight) <= width) {
    return text;
  }

  while (
    text.length &&
    measureTextWidth(text + CHAR_ELLIPSES, fontSize, fontWeight) > width
  ) {
    text = text.substring(0, text.length - 1).trim();
  }

  return text + CHAR_ELLIPSES;
};
