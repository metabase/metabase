import type * as Lib from "metabase-lib";
import type { FilterOperatorOption } from "metabase/querying/filters/types";

export type DefaultFilterOperatorOption =
  FilterOperatorOption<Lib.DefaultFilterOperator>;

export type DefaultFilterOperatorInfo = {
  operator: Lib.DefaultFilterOperator;
};
