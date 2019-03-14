import React from "react";

import cx from "classnames";
import { ngettext, msgid, t } from "c-3po";

import { formatNumber } from "metabase/lib/formatting";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Input from "metabase/components/Input";

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
  if (query instanceof StructuredQuery) {
    const limit = query.limit();
    content = (
      <PopoverWithTrigger
        triggerElement={message}
        triggerClasses={limit != null ? "text-brand" : ""}
      >
        {({ onClose }) => (
          <div className="p2 text-bold text-medium">
            <div
              className={cx("mb2 mx1 cursor-pointer text-brand-hover", {
                "text-brand": limit == null,
              })}
              onClick={() => {
                query.clearLimit().update();
                onClose();
              }}
            >
              {t`Show maximum`}
            </div>
            <div>
              <Input
                defaultValue={limit}
                className={cx({ "text-brand border-brand": limit != null })}
                placeholder={t`Pick a limit`}
                onKeyPress={e => {
                  if (e.key === "Enter") {
                    const value = parseInt(e.target.value, 10);
                    if (value > 0) {
                      query.updateLimit(value).update();
                    } else {
                      query.clearLimit().update();
                    }
                    onClose();
                  }
                }}
              />
            </div>
          </div>
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
