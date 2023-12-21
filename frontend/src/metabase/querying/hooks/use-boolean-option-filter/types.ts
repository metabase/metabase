import type * as Lib from "metabase-lib";
import type { FilterOperatorOption } from "metabase/querying/utils/filters";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface OperatorOption
  extends FilterOperatorOption<Lib.BooleanFilterOperatorName> {
  type: OptionType;
  isAdvanced?: boolean;
}
