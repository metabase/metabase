import { msgid, ngettext, t } from "ttag";

import { formatNumber } from "metabase/lib/formatting/numbers";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils/index";
import type { Dataset } from "metabase-types/api";

export const formatRowCount = (count: number) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

export function getRowCountMessage(result: Dataset): string {
  if (result.data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(result.row_count)}`;
  }
  if (result.row_count === HARD_ROW_LIMIT) {
    return t`Showing first ${HARD_ROW_LIMIT} rows`;
  }
  return t`Showing ${formatRowCount(result.row_count)}`;
}
