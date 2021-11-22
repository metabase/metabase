const CHAR_WIDTH = 6;
const CHAR_ELLIPSES = "…";

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.5;
};

export const measureText = (text: string, charWidth = CHAR_WIDTH) => {
  return text.length * charWidth;
};

export const truncateText = (text: string, width: number) => {
  if (measureText(text) <= width) {
    return text;
  }

  while (text.length && measureText(text + CHAR_ELLIPSES) > width) {
    text = text.substring(0, text.length - 1);
  }

  return text + CHAR_ELLIPSES;
};
