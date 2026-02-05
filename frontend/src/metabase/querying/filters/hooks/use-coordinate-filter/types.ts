import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

type CoordinatePickerOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "inside"
  | ">="
  | "<=";

export type CoordinateFilterOperatorOption =
  FilterOperatorOption<CoordinatePickerOperator>;

export type CoordinateFilterOperatorInfo = {
  operator: CoordinatePickerOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;
