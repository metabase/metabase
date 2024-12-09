import type { FilterOperatorOption } from "metabase/querying/filters/utils/operators";
import type * as Lib from "metabase-lib";

export type OptionType = "true" | "false" | "is-null" | "not-null";

export interface OperatorOption
  extends FilterOperatorOption<Lib.BooleanFilterOperator> {
  type: OptionType;
  isAdvanced?: boolean;
}
