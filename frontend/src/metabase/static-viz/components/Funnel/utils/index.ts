import { PolygonProps } from "@visx/shape/lib/shapes/Polygon";
import { FunnelDatum, FunnelStep } from "./../types";

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

export const formatPercent = (percent: number) =>
  `${(100 * percent).toFixed(2)} %`;

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
