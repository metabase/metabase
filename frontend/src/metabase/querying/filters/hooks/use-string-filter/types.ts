import type { FilterOperatorOption } from "metabase/querying/filters/utils/operators";
import type * as Lib from "metabase-lib";

export type OperatorType = "exact" | "partial" | "empty";

export interface OperatorOption
  extends FilterOperatorOption<Lib.StringFilterOperatorName> {
  type: OperatorType;
}
