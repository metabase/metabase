import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type TimeFilterOperatorOption =
  FilterOperatorOption<Lib.TimeFilterOperator>;

export type TimeFilterOperatorInfo = {
  operator: Lib.TimeFilterOperator;
  valueCount: number;
};

export type TimeValue = Date | null;
