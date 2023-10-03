import type * as Lib from "metabase-lib";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface Option {
  name: string;
  type: OptionType;
  operator: Lib.BooleanFilterOperatorName;
  isAdvanced?: boolean;
}
