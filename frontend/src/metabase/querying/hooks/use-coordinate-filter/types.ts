import type { FilterOperatorOption } from "metabase/querying/utils/filters";
import type { NumericValue } from "metabase-types/api/number";

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

export type NumberValue = NumericValue | "";
