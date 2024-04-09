import type { FilterOperatorOption } from "metabase/querying/utils/filters";

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

export type NumberValue = number | "";
