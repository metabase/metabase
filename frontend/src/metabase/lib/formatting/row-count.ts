import { msgid, ngettext, t } from "ttag";

import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import type { NumberFormatter } from "../../common/hooks/use-number-formatter";

export const formatRowCount = (
  count: number,
  formatNumber: NumberFormatter,
) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

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
