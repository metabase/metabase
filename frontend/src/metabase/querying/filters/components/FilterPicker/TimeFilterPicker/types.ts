import type * as Lib from "metabase-lib";
import type { FilterOperatorOption } from "metabase/querying/filters/types";

export type TimeFilterOperatorOption =
  FilterOperatorOption<Lib.TimeFilterOperator>;

export type TimeFilterOperatorInfo = {
  operator: Lib.TimeFilterOperator;
  valueCount: number;
};

export type TimeValue = Date | null;
