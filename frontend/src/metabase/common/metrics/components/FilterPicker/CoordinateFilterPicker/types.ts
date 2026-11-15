import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../types";

export type CoordinatePickerOperator =
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
