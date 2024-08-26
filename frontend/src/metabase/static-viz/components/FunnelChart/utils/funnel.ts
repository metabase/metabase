import type { PolygonProps } from "@visx/shape/lib/shapes/Polygon";

import { isNotNull } from "metabase/lib/types";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import { truncateText } from "metabase/static-viz/lib/text";

import type { FunnelDatum, FunnelSettings, FunnelStep, Step } from "../types";

export const calculateFunnelSteps = (
  data: FunnelDatum[],
  stepWidth: number,
  funnelHeight: number,
): FunnelStep[] => {
  return data.map((datum, index) => {
    const [_, firstMeasure] = data[0];
    const [step, measure] = datum;
    const left = index * stepWidth;
    const height = (measure * funnelHeight) / firstMeasure;
    const top = (funnelHeight - height) / 2;
    const percent = firstMeasure > 0 ? measure / firstMeasure : 0;

    return {
      step: step.toString(),
      measure,
      percent,
      top,
      left,
      height,
    };
  });
};

export const calculateStepOpacity = (index: number, stepsCount: number) =>
  1 - index * (0.9 / (stepsCount + 1));

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
  const stepName = truncateText(
    formattedStepName,
    maxStepTextWidth,
    stepFontSize,
  );

  const formattedMeasure = formatNumber(
    step.measure,
    settings?.measure?.format,
  );
  const measure = isFirst
    ? formattedMeasure
    : truncateText(formattedMeasure, maxStepTextWidth, measureFontSize);

  const percent = truncateText(
    formatPercent(step.percent),
    maxStepTextWidth,
    percentFontSize,
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

  const keys = data.map(datum => String(datum[0]));

  return funnelOrder
    .map(orderedItem => {
      if (orderedItem.enabled) {
        const dataIndex = keys.findIndex(key => key === orderedItem.key);
        return data[dataIndex];
      }
    })
    .filter(isNotNull);
};
