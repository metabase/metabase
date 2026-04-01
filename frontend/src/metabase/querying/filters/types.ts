import type * as Lib from "metabase-lib";

export type FilterOperatorOption<T extends string = Lib.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type { DateFilterDisplayOpts } from "metabase/querying/common/types";
