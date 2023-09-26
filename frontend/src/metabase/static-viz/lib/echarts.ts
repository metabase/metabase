// Removing xmlns attributes that cause Batik failing to convert svg to png
export const sanitizeSvgForBatik = (svg: string) => {
  return svg
    .replace('xmlns="http://www.w3.org/2000/svg"', "")
    .replace('xmlns:xlink="http://www.w3.org/1999/xlink"', "");
};
