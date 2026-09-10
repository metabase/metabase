export type Step = string | number;
export type Measure = number;

export type FunnelDatum = [Step, Measure];

export type FunnelStep = {
  step: string | number;
  measure: number;
  percent: number;
  top: number;
  left: number;
  height: number;
};
