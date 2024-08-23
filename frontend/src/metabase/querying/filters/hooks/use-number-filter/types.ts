import type { FilterOperatorOption } from "metabase/querying/filters/utils";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.NumberFilterOperatorName> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberValue = number | "";
