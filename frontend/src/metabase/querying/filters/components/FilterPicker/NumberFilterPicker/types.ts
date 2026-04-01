import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type NumberPickerOperator = Lib.NumberFilterOperator | "not-between";

export type NumberFilterOperatorOption =
  FilterOperatorOption<NumberPickerOperator>;

export type NumberFilterOperatorInfo = {
  operator: NumberPickerOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;
