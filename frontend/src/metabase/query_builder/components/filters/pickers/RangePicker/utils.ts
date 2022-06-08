const stepIntervals = [
  [100, 1],
  [250, 5],
  [1000, 25],
  [10000, 100],
  [50000, 250],
  [250000, 1000],
  [1000000, 10000],
];

const MAX_STEP = 250000;
const DECIMAL_STEP = 0.25;

export const hasDecimal = (value: number) => value % 1 !== 0;

export const getStep = (min: number, max: number): number => {
  if (hasDecimal(min) || hasDecimal(max)) {
    return DECIMAL_STEP;
  }

  const range = max - min;
  return stepIntervals.find(([maxRange]) => range <= maxRange)?.[1] ?? MAX_STEP;
};

export const roundToStep = (value: number, step: number): number => {
  const rounded = Math.round(value / step) * step;
  return rounded;
};
