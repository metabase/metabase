import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../types";

export type NumberFilterOperatorOption =
  FilterOperatorOption<Lib.NumberFilterOperator>;

export type NumberFilterOperatorInfo = {
  operator: Lib.NumberFilterOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;
