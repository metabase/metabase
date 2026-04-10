import { t } from "ttag";

import type { NumberFormatter } from "../hooks/use-number-formatter";

import { formatRowCount } from "./format-row-count";

export function getRowCountMessage(
  result: { data: { rows_truncated: number }; row_count: number },
  formatNumber: NumberFormatter,
  maxRowCount: number,
) {
  if (result.data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(result.row_count, formatNumber)}`;
  }
  if (result.row_count === maxRowCount) {
    return t`Showing first ${formatRowCount(maxRowCount, formatNumber)}`;
  }
  return t`Showing ${formatRowCount(result.row_count, formatNumber)}`;
}
