import { PolygonProps } from "@visx/shape/lib/shapes/Polygon";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import { truncateText } from "metabase/static-viz/lib/text";
import { FunnelSettings, FunnelStep } from "../types";
import { FunnelDatum } from "./data";

export const calculateFunnelSteps = (
  data: FunnelDatum[],
  stepWidth: number,
  funnelHeight: number,
): FunnelStep[] => {
  const firstStepMetric = data[0].metric ?? 0;

  return data.map((datum, index) => {
    const datumMetric = datum.metric ?? 0;
    const left = index * stepWidth;
    const height = (datumMetric * funnelHeight) / firstStepMetric;
    const top = (funnelHeight - height) / 2;
    const percent = firstStepMetric > 0 ? datumMetric / firstStepMetric : 0;

    return {
      step: String(datum.dimension),
      measure: datum.metric ?? 0,
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
