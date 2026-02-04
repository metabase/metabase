import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type DefaultFilterOperatorOption =
  FilterOperatorOption<Lib.DefaultFilterOperator>;

export type DefaultFilterOperatorInfo = {
  operator: Lib.DefaultFilterOperator;
};
