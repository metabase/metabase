export type Step = string | number;
export type Measure = number;

export type FunnelDatum = [Step, Measure];

export type FunnelSettings = {
  step: {
    name: string;
  };
  colors: {
    textMedium: string;
    brand: string;
    border: string;
  };
};

export type FunnelStep = {
  step: string;
  measure: number;
  percent: number;
  top: number;
  left: number;
  height: number;
};
