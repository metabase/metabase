import type * as Lib from "metabase-lib";

export interface FilterOperatorOption<T extends Lib.FilterOperatorName> {
  operator: T;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}
