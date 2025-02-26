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

export interface OperatorOption
  extends FilterOperatorOption<CoordinatePickerOperator> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;
