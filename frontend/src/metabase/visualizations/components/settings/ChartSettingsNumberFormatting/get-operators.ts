import { t } from "ttag";

import type { NumberFormattingOperator } from "./types";

export const NUMBER_OPERATOR_NAMES: Record<NumberFormattingOperator, string> = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "=": t`is equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "!=": t`is not equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "<": t`is less than`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ">": t`is greater than`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "<=": t`is less than or equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ">=": t`is greater than or equal to`,
};
