const CHAR_WIDTH = 6;
const CHAR_ELLIPSES = "…";

export const measureText = text => {
  return text.length * CHAR_WIDTH;
};

export const truncateText = (text, width) => {
  if (measureText(text) <= width) {
    return text;
  }

  while (text.length && measureText(text + CHAR_ELLIPSES) > width) {
    text = text.substring(0, text.length - 1);
  }

  return text + CHAR_ELLIPSES;
};
