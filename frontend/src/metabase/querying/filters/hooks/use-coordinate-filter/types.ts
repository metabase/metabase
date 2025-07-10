import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<UiCoordinateFilterOperator> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;

export type UiCoordinateFilterOperator = Exclude<
  Lib.CoordinateFilterOperator,
  ">" | "<" | "<=" | ">="
>;

export type UiCoordinateFilterParts = Omit<
  Lib.CoordinateFilterParts,
  "values" | "operator"
> & {
  values: NumberOrEmptyValue[];
  operator: UiCoordinateFilterOperator;
};
