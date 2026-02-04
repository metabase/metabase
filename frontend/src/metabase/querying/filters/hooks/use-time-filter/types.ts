import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../../types";

export type TimeFilterOperatorOption =
  FilterOperatorOption<Lib.TimeFilterOperator>;

export type TimeFilterOperatorInfo = {
  operator: Lib.TimeFilterOperator;
  valueCount: number;
};

export type TimeValue = Date | null;
