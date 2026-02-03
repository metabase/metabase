import type {
  FunnelDatum,
  FunnelStep,
} from "metabase/static-viz/components/FunnelChart/types";

export const calculateFunnelSteps = (
  data: FunnelDatum[],
  stepWidth: number,
  funnelHeight: number,
): FunnelStep[] => {
  const firstMeasure = data[0][1];
  const maxMeasure = Math.max(...data.map((datum) => datum[1]));
  return data.map((datum, index) => {
    const [step, measure] = datum;
    const left = index * stepWidth;
    const height = (measure * funnelHeight) / maxMeasure;
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
