import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText, measureTextHeight } from "metabase/static-viz/lib/text";
import { FunnelSettings } from "../types";
import { FunnelDatum } from "./data";

export const calculateMargin = (
  firstStep: FunnelDatum,
  stepFontSize: number,
  percentFontSize: number,
  measureFontSize: number,
  initialMeasureFontSize: number,
  nameFontSize: number,
  measureBottomOffset: number,
  paddingLeft: number,
) => {
  const formattedFirstMeasure = formatNumber(
    firstStep.metric ?? 0,
    settings?.measure?.format,
  );

  const top = measureTextHeight(stepFontSize);
  const bottom =
    measureTextHeight(percentFontSize) +
    measureTextHeight(measureFontSize) +
    measureBottomOffset;

  const left =
    Math.max(
      measureText(firstStep.toString(), stepFontSize),
      measureText(formattedFirstMeasure, initialMeasureFontSize),
      measureText(, nameFontSize),
    ) + paddingLeft;

  return {
    top,
    bottom,
    left,
    rigth: 0,
  };
};
