import { init } from "server-text-width";

import {
  CHAR_SIZES,
  CHAR_SIZES_FONT_SIZE,
  CHAR_SIZES_FONT_WEIGHT,
} from "../constants/char-sizes";

const CHAR_ELLIPSES = "…";
const FONT_WEIGHT_WIDTH_FACTOR = 0.039;

export const { getTextWidth } = init(CHAR_SIZES);

export const measureTextWidth = (
  text: string,
  fontSize: number,
  fontWeight: number = CHAR_SIZES_FONT_WEIGHT,
) => {
  const sizeFactor = fontSize / CHAR_SIZES_FONT_SIZE;
  const weightFactor =
    1 +
    (fontWeight - CHAR_SIZES_FONT_WEIGHT) *
      (FONT_WEIGHT_WIDTH_FACTOR / CHAR_SIZES_FONT_WEIGHT);

  const baseWidth = getTextWidth(text, {
    fontSize: `${CHAR_SIZES_FONT_SIZE}px`,
    fontWeight: CHAR_SIZES_FONT_WEIGHT.toString(),
  });

  return sizeFactor * baseWidth * weightFactor;
};

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.3;
};

export const truncateText = (
  text: string,
  width: number,
  fontSize: number,
  fontWeight = CHAR_SIZES_FONT_WEIGHT,
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

const parseEChartsFontString = (fontString: string) => {
  const parts = fontString.split(/\s+/);

  if (parts.length < 2) {
    throw new Error("Invalid font string format");
  }

  let fontWeightPart: string;
  let fontSizePart: string;
  let fontFamilyParts: string[];

  if (/^\d+$/.test(parts[0])) {
    // Format: "fontWeight fontSize fontFamily", example: 900 12px Lato
    [fontWeightPart, fontSizePart, ...fontFamilyParts] = parts;
  } else {
    // Format: "fontWeight??? fontWeight fontSize fontFamily", example: normal 900 12px Lato
    [, fontWeightPart, fontSizePart, ...fontFamilyParts] = parts;
  }

  let parsedFontWeight: number;
  switch (fontWeightPart.toLowerCase()) {
    case "normal":
      parsedFontWeight = 400;
      break;
    case "bold":
      parsedFontWeight = 700;
      break;
    case "bolder":
      parsedFontWeight = 800;
      break;
    case "lighter":
      parsedFontWeight = 300;
      break;
    default:
      parsedFontWeight = parseInt(fontWeightPart, 10) || 400;
      break;
  }

  return {
    fontFamily: fontFamilyParts.join(" "),
    fontSize: parseFloat(fontSizePart),
    fontWeight: parsedFontWeight,
  };
};

export const measureTextEChartsAdapter = (
  text: string,
  font?: string,
): { width: number } => {
  let fontSize = CHAR_SIZES_FONT_SIZE;
  let fontWeight = CHAR_SIZES_FONT_WEIGHT;

  if (font) {
    const parsedFont = parseEChartsFontString(font);
    fontSize = parsedFont.fontSize;
    fontWeight = parsedFont.fontWeight;
  }

  const width = measureTextWidth(text, fontSize, fontWeight);

  return {
    width,
  };
};
