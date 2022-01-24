const CHAR_ELLIPSES = "…";
const DEFAULT_FONT_WEIGHT = 400;

// TODO: Replace this rough simple approximation with a correct one
const getCharWidth = (fontSize: number, fontWeight: number) => {
  const fontWeightDivider = Math.sqrt(fontWeight / DEFAULT_FONT_WEIGHT);

  if (fontSize <= 12) {
    return fontSize / (2.15 * fontWeightDivider);
  }

  if (fontSize <= 16) {
    return fontSize / (1.84 * fontWeightDivider);
  }

  return fontSize / (1.7 * fontWeightDivider);
};

export const measureText = (
  text: string,
  fontSize: number,
  fontWeight = DEFAULT_FONT_WEIGHT,
) => {
  return text.length * getCharWidth(fontSize, fontWeight);
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
  if (measureText(text, fontSize, fontWeight) <= width) {
    return text;
  }

  while (
    text.length &&
    measureText(text + CHAR_ELLIPSES, fontSize, fontWeight) > width
  ) {
    text = text.substring(0, text.length - 1).trim();
  }

  return text + CHAR_ELLIPSES;
};
