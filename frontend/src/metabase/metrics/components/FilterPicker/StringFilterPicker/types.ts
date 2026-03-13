import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../types";

export type OperatorType = "exact" | "partial" | "empty";

export type StringFilterOperatorOption =
  FilterOperatorOption<Lib.StringFilterOperator>;

export type StringFilterOperatorInfo = {
  operator: Lib.StringFilterOperator;
  type: OperatorType;
};
