import React from "react";

import { ngettext, msgid, t } from "c-3po";

import { formatNumber } from "metabase/lib/formatting";

const QuestionRowCount = ({ question, result, className, ...props }) => {
  const countString = formatNumber(result.row_count);
  const rowsString = ngettext(msgid`row`, `rows`, result.row_count);
  const content =
    result.data.rows_truncated != null
      ? t`Showing first ${countString} ${rowsString}`
      : t`Showing ${countString} ${rowsString}`;

  return (
    <span className={className} {...props}>
      {content}
    </span>
  );
};

QuestionRowCount.shouldRender = ({ question, result, isObjectDetail }) =>
  result && result.data && !isObjectDetail && question.display() === "table";

export default QuestionRowCount;
