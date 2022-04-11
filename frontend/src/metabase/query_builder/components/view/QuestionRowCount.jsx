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
  let limitMessage = null;
  if (query instanceof StructuredQuery) {
    if (query.limit() == null || query.limit() >= HARD_ROW_LIMIT) {
      if (typeof result.row_count === "number") {
        // The query has been altered but we might still have the old result set,
        // so show that instead of a generic HARD_ROW_LIMIT
        limitMessage = t`Showing ${formatRowCount(result.row_count)}`;
      } else {
        limitMessage = cappedMessage;
      }
    } else {
      limitMessage = t`Show ${formatRowCount(query.limit())}`;
    }
  }

  // Shown based on a query that has been run
  let resultMessage;
  if (result.data.rows_truncated != null) {
    resultMessage = t`Showing first ${formatRowCount(result.row_count)}`;
  } else if (result.row_count === HARD_ROW_LIMIT) {
    resultMessage = cappedMessage;
  } else {
    resultMessage = t`Showing ${formatRowCount(result.row_count)}`;
  }

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
