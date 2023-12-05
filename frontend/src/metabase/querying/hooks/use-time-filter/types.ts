import type * as Lib from "metabase-lib";
import type { OperatorOption } from "../types";

export interface Option extends OperatorOption<Lib.TimeFilterOperatorName> {
  valueCount: number;
}
