import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../../types";

export type DefaultFilterOperatorOption =
  FilterOperatorOption<Lib.DefaultFilterOperator>;

export type DefaultFilterOperatorInfo = {
  operator: Lib.DefaultFilterOperator;
};
