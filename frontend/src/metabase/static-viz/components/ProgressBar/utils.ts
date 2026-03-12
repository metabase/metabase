import { measureTextWidth } from "metabase/static-viz/lib/text";

export const calculatePointerLabelShift = (
  valueText: string,
  pointerX: number,
  xMin: number,
  xMax: number,
  pointerWidth: number,
  fontSize: number,
) => {
  const valueTextWidth = measureTextWidth(valueText, fontSize);

  const distanceToLeftBorder = pointerX - xMin;
  const isCrossingLeftBorder = valueTextWidth / 2 > distanceToLeftBorder;
  if (isCrossingLeftBorder) {
    return valueTextWidth / 2 - distanceToLeftBorder - pointerWidth / 2;
  }

  const distanceToRightBorder = xMax - pointerX;
  const isCrossingRightBorder = valueTextWidth / 2 > distanceToRightBorder;
  if (isCrossingRightBorder) {
    return distanceToRightBorder - valueTextWidth / 2 + pointerWidth / 2;
  }

  return 0;
};
