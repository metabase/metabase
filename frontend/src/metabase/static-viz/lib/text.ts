const CHAR_ELLIPSES = "…";

// TODO: Replace this rough simple approximation with a correct one
const getCharWidth = (fontSize: number) => {
  if (fontSize <= 12) {
    return fontSize / 2.15;
  }

  if (fontSize <= 16) {
    return fontSize / 1.84;
  }

  return fontSize / 1.7;
};

export const measureText = (text: string, fontSize: number) => {
  return text.length * getCharWidth(fontSize);
};

export const measureTextHeight = (fontSize: number) => {
  return fontSize * 1.3;
};

export const truncateText = (text: string, width: number, fontSize: number) => {
  if (measureText(text, fontSize) <= width) {
    return text;
  }

  while (text.length && measureText(text + CHAR_ELLIPSES, fontSize) > width) {
    text = text.substring(0, text.length - 1);
  }

  return text + CHAR_ELLIPSES;
};
