import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type TimePickerOperator = Lib.TimeFilterOperator | "not-between";

export type TimeFilterOperatorOption = FilterOperatorOption<TimePickerOperator>;

export type TimeFilterOperatorInfo = {
  operator: TimePickerOperator;
  valueCount: number;
};

export type TimeValue = Date | null;
