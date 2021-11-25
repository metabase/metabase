const CHAR_WIDTH = 6;
const CHAR_ELLIPSES = "…";

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.25;
};

export const measureText = (text: string, charWidth = CHAR_WIDTH) => {
  return text.length * charWidth;
};

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.3;
};

export const truncateText = (
  text: string,
  width: number,
  charWidth = CHAR_WIDTH,
) => {
  if (measureText(text, charWidth) <= width) {
    return text;
  }

  while (text.length && measureText(text + CHAR_ELLIPSES, charWidth) > width) {
    text = text.substring(0, text.length - 1);
  }

  return text + CHAR_ELLIPSES;
};
