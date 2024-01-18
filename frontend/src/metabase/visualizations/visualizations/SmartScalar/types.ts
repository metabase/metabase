import type { COMPARISON_TYPES } from "./constants";

type AnotherColumnMenuOption = {
  type: typeof COMPARISON_TYPES.ANOTHER_COLUMN;
  name: string;
};
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
type StaticNumberMenuOption = {
  type: typeof COMPARISON_TYPES.STATIC_NUMBER;
  name: string;
};
export type ComparisonMenuOption =
  | AnotherColumnMenuOption
  | PreviousValueMenuOption
  | PreviousPeriodMenuOption
  | PeriodsAgoMenuOption
  | StaticNumberMenuOption;
