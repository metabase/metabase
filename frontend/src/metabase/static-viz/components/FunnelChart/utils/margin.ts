import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText, measureTextHeight } from "metabase/static-viz/lib/text";
import { FunnelDatum, FunnelSettings } from "../types";

export const calculateMargin = (
  firstStep: FunnelDatum,
  stepFontSize: number,
  percentFontSize: number,
  measureFontSize: number,
  initialMeasureFontSize: number,
  nameFontSize: number,
  measureBottomOffset: number,
  paddingLeft: number,
  settings: FunnelSettings,
) => {
  const [_, measure] = firstStep;
  const formattedFirstMeasure = formatNumber(
    measure,
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
      measureText(settings.step.name, nameFontSize),
    ) + paddingLeft;

  return {
    top,
    bottom,
    left,
    rigth: 0,
  };
};
