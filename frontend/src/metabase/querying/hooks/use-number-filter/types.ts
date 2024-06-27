import type { FilterOperatorOption } from "metabase/querying/utils/filters";
import type * as Lib from "metabase-lib";
import type { NumericValue } from "metabase-types/api/number";

export interface OperatorOption
  extends FilterOperatorOption<Lib.NumberFilterOperatorName> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberValue = NumericValue | "";
