import React from "react";
import { ngettext, msgid, t } from "ttag";

import { formatNumber } from "metabase/lib/formatting";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import LimitPopover from "metabase/query_builder/components/LimitPopover";

import type { Dataset } from "metabase-types/api";

import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

const formatRowCount = (count: number) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

interface QuestionRowCountProps {
  question: Question;
  result: Dataset;
  isResultDirty: boolean;
  className?: string;
  onQueryChange: (query: StructuredQuery) => void;
}

function QuestionRowCount({
  question,
  result,
  isResultDirty,
  className,
  onQueryChange,
}: QuestionRowCountProps) {
  const isStructured = question.isStructured();

  const cappedMessage = t`Showing first ${HARD_ROW_LIMIT} rows`;

  // Shown based on a query that has been altered
  let limitMessage = null;
  if (isStructured) {
    const query = question.query() as StructuredQuery;
    const limit = query.limit();

    if (limit == null || limit >= HARD_ROW_LIMIT) {
      if (typeof result.row_count === "number") {
        // The query has been altered but we might still have the old result set,
        // so show that instead of a generic HARD_ROW_LIMIT
        limitMessage = t`Showing ${formatRowCount(result.row_count)}`;
      } else {
        limitMessage = cappedMessage;
      }
    } else {
      limitMessage = t`Show ${formatRowCount(limit)}`;
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
  if (isStructured && question.query().isEditable()) {
    const query = question.query() as StructuredQuery;
    const limit = query.limit();
    content = (
      <PopoverWithTrigger
        triggerElement={
          <span className="text-brand-hover text-bold">{message}</span>
        }
        triggerClasses={limit != null ? "text-brand" : ""}
      >
        {({ onClose }: { onClose: () => void }) => (
          <LimitPopover
            className="p2"
            limit={limit}
            onChangeLimit={(limit: number) => {
              if (limit > 0) {
                onQueryChange(query.updateLimit(limit));
              } else {
                onQueryChange(query.clearLimit());
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
}

QuestionRowCount.shouldRender = ({
  question,
  result,
  isObjectDetail,
}: {
  question: Question;
  result?: Dataset;
  isObjectDetail: boolean;
}) =>
  result && result.data && !isObjectDetail && question.display() === "table";

export default QuestionRowCount;
