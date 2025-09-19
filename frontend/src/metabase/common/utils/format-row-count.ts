import { msgid, ngettext } from "ttag";

import type { NumberFormatter } from "../hooks/use-number-formatter";

export const formatRowCount = (
  count: number,
  formatNumber: NumberFormatter,
) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};
