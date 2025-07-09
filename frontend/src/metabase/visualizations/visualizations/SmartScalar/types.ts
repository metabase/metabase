import type { IconName } from "metabase/ui";
import type {
  ClickObject,
  ColumnSettings,
} from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

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

export interface ComparisonResult {
  changeArrowIconName?: IconName;
  changeColor?: string;
  changeType: string;
  comparisonDescStr: string;
  comparisonValue?: RowValue;
  display: {
    percentChange: string;
    comparisonValue: string;
  };
  percentChange: number;
}

export interface TrendResult {
  trend?: {
    value: RowValue;
    clicked: ClickObject;
    formatOptions: ColumnSettings;
    display: {
      value: string | number | JSX.Element | null;
      date: string;
    };
    comparisons: ComparisonResult[];
  };
  error?: Error;
}
