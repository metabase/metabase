import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type NumberFilterOperatorOption =
  FilterOperatorOption<Lib.NumberFilterOperator>;

export type NumberFilterOperatorInfo = {
  operator: Lib.NumberFilterOperator;
  valueCount: number;
  hasMultipleValues?: boolean;
};

export type NumberOrEmptyValue = Lib.NumberFilterValue | null;
