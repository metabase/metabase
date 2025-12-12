import { t } from "ttag";

import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import type { NumberFormatter } from "../hooks/use-number-formatter";

import { formatRowCount } from "./format-row-count";

export function getRowCountMessage(
  result: { data: { rows_truncated: number }; row_count: number },
  formatNumber: NumberFormatter,
) {
  if (result.data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(result.row_count, formatNumber)}`;
  }
  if (result.row_count === HARD_ROW_LIMIT) {
    return t`Showing first ${formatRowCount(HARD_ROW_LIMIT, formatNumber)}`;
  }
  return t`Showing ${formatRowCount(result.row_count, formatNumber)}`;
}
