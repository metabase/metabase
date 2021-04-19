/* eslint-disable react/prop-types */
import React from "react";

import { ngettext, msgid, t } from "ttag";

import { formatNumber } from "metabase/lib/formatting";
import { HARD_ROW_LIMIT } from "metabase/lib/query";

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

  const cappedMessage = t`Showing first ${HARD_ROW_LIMIT} rows`;

  // Shown based on a query that has been altered
  const limitMessage =
    query instanceof StructuredQuery
      ? query.limit() == null || query.limit() >= HARD_ROW_LIMIT
        ? cappedMessage
        : t`Show ${formatRowCount(query.limit())}`
      : null;

  // Shown based on a query that has been run
  const resultMessage =
    result.data.rows_truncated != null
      ? t`Showing first ${formatRowCount(result.row_count)}`
      : result.row_count === HARD_ROW_LIMIT
      ? cappedMessage
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
