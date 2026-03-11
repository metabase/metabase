import type { PolygonProps } from "@visx/shape/lib/shapes/Polygon";

import { isNotNull } from "metabase/lib/types";
import { CHAR_SIZES_FONT_WEIGHT } from "metabase/static-viz/constants/char-sizes";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { truncateText } from "metabase/visualizations/lib/text";
import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";

import type { FunnelDatum, FunnelSettings, FunnelStep, Step } from "../types";

type StepDimensions = Pick<FunnelStep, "top" | "left" | "height">;

export const calculateFunnelPolygonPoints = (
  step: StepDimensions,
  nextStep: StepDimensions,
  marginTop: number,
) => {
  const points: PolygonProps["points"] = nextStep && [
    [step.left, step.top + marginTop],
    [nextStep.left, nextStep.top + marginTop],
    [nextStep.left, nextStep.top + nextStep.height + marginTop],
    [step.left, step.top + step.height + marginTop],
  ];

  return points;
};

export const getFormattedStep = (
  step: FunnelStep,
  maxStepTextWidth: number,
  stepFontSize: number,
  measureFontSize: number,
  percentFontSize: number,
  settings: FunnelSettings,
  isFirst: boolean,
) => {
  const formattedStepName =
    typeof step.step === "number"
      ? formatNumber(step.step, settings?.step?.format)
      : step.step;

  const textMeasurer: TextWidthMeasurer = (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight));

  const fontStyle = {
    size: stepFontSize,
    weight: CHAR_SIZES_FONT_WEIGHT,
    family: "Lato",
  };

  const stepName = truncateText(
    formattedStepName,
    maxStepTextWidth,
    textMeasurer,
    fontStyle,
  );

  const formattedMeasure = formatNumber(
    step.measure,
    settings?.measure?.format,
  );
  const measure = isFirst
    ? formattedMeasure
    : truncateText(formattedMeasure, maxStepTextWidth, textMeasurer, {
        ...fontStyle,
        size: measureFontSize,
      });

  const percent = truncateText(
    formatPercent(step.percent),
    maxStepTextWidth,
    textMeasurer,
    {
      ...fontStyle,
      size: percentFontSize,
    },
  );

  return {
    percent,
    measure,
    stepName,
  };
};

export const groupData = (data: FunnelDatum[]) => {
  const groupedData = new Map<Step, FunnelDatum>();

  for (const row of data) {
    const existingValue = groupedData.get(row[0]);

    if (existingValue == null) {
      groupedData.set(row[0], [...row]);
      continue;
    } else {
      existingValue[1] += row[1];
    }
  }

  return Array.from(groupedData.values());
};

export const reorderData = (
  data: FunnelDatum[],
  settings: FunnelSettings,
): FunnelDatum[] => {
  const funnelOrder = settings.visualization_settings["funnel.rows"];
  if (funnelOrder == null) {
    return data;
  }

  const keys = data.map((datum) => String(datum[0]));

  return funnelOrder
    .map((orderedItem) => {
      if (orderedItem.enabled) {
        const dataIndex = keys.findIndex((key) => key === orderedItem.key);
        return data[dataIndex];
      }
    })
    .filter(isNotNull);
};
