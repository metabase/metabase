import type { COMPARISON_TYPES } from "./constants";

type PreviousValueMenuOption = {
  type: typeof COMPARISON_TYPES.PREVIOUS_VALUE;
  name: string;
};
type PreviousPeriodMenuOption = {
  type: typeof COMPARISON_TYPES.PREVIOUS_PERIOD;
  name: string;
};
type PeriodsAgoMenuOption = {
  type: typeof COMPARISON_TYPES.PERIODS_AGO;
  name: string;
  maxValue: number;
};
export type ComparisonMenuOption =
  | PreviousValueMenuOption
  | PreviousPeriodMenuOption
  | PeriodsAgoMenuOption;
