import React from "react";

import { ngettext, msgid, t } from "ttag";

import { formatNumber } from "metabase/lib/formatting";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import LimitPopover from "metabase/query_builder/components/LimitPopover";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const QuestionRowCount = ({
  question,
  result,
  className,
  isResultDirty,
  ...props
}) => {
  const formatRowCount = count => {
    const countString = formatNumber(count);
    return ngettext(msgid`${countString} row`, `${countString} rows`, count);
  };

  const query = question.query();

  const limitMessage =
    query instanceof StructuredQuery
      ? query.limit() == null
        ? t`Show all rows`
        : t`Show ${formatRowCount(query.limit())}`
      : null;

  const resultMessage =
    result.data.rows_truncated != null
      ? t`Showing first ${formatRowCount(result.row_count)}`
      : t`Showing ${formatRowCount(result.row_count)}`;

  const message = isResultDirty ? limitMessage : resultMessage;

  let content;
  if (query instanceof StructuredQuery && query.isEditable()) {
    const limit = query.limit();
    content = (
      <PopoverWithTrigger
        triggerElement={
          <span className="text-brand-hover text-bold">{message}</span>
        }
        triggerClasses={limit != null ? "text-brand" : ""}
      >
        {({ onClose }) => (
          <LimitPopover
            className="p2"
            limit={limit}
            onChangeLimit={limit => {
              if (limit > 0) {
                query.updateLimit(limit).update();
              } else {
                query.clearLimit().update();
              }
            }}
            onClose={onClose}
          />
        )}
      </PopoverWithTrigger>
    );
  } else {
    content = message;
  }

  return <span className={className}>{content}</span>;
};

QuestionRowCount.shouldRender = ({ question, result, isObjectDetail }) =>
  result && result.data && !isObjectDetail && question.display() === "table";

export default QuestionRowCount;
