import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type OperatorType = "exact" | "partial" | "empty";

export type StringFilterOperatorOption =
  FilterOperatorOption<Lib.StringFilterOperator>;

export type StringFilterOperatorInfo = {
  operator: Lib.StringFilterOperator;
  type: OperatorType;
};
