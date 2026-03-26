import type * as Lib from "metabase-lib";

export type FilterOperatorOption<T extends Lib.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type { DateFilterDisplayOpts } from "metabase/querying/common/types";
