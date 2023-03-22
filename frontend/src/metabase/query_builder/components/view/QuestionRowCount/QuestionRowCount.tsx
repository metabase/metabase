import React, { useMemo } from "react";
import { ngettext, msgid, t } from "ttag";
import { connect } from "react-redux";

import { formatNumber } from "metabase/lib/formatting";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { setLimit } from "metabase/query_builder/actions";
import {
  getFirstQueryResult,
  getIsResultDirty,
  getQuestion,
} from "metabase/query_builder/selectors";
import LimitPopover from "metabase/query_builder/components/LimitPopover";

import type { Dataset } from "metabase-types/api";
import type { State } from "metabase-types/store";

import * as MetabaseLib from "metabase-lib/v2";
import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";
import type { Limit } from "metabase-lib/v2/types";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { RowCountButton, RowCountStaticLabel } from "./QuestionRowCount.styled";

interface OwnProps {
  className?: string;
}

interface StateProps {
  question: Question;
  limit: Limit;
  result: Dataset;
  isResultDirty: boolean;
}

interface DispatchProps {
  onChangeLimit: (limit: Limit) => void;
}

type QuestionRowCountProps = OwnProps & StateProps & DispatchProps;

function mapStateToProps(state: State) {
  // Not expected to render before question is loaded
  const question = getQuestion(state) as Question;

  const limit = MetabaseLib.currentLimit(question._getMLv2Query());
  return {
    limit,
    question,
    result: getFirstQueryResult(state),
    isResultDirty: getIsResultDirty(state),
  };
}

const mapDispatchToProps = {
  onChangeLimit: setLimit,
};

function QuestionRowCount({
  question,
  result,
  isResultDirty,
  className,
  onChangeLimit,
}: QuestionRowCountProps) {
  const message = useMemo(() => {
    if (!question.isStructured()) {
      return isResultDirty ? "" : getRowCountMessage(result);
    }
    return isResultDirty
      ? getLimitMessage(question.query() as StructuredQuery, result)
      : getRowCountMessage(result);
  }, [question, result, isResultDirty]);

  const handleLimitChange = (limit: number) => {
    if (limit > 0) {
      onChangeLimit(limit);
    } else {
      onChangeLimit(null);
    }
  };

  const canChangeLimit =
    question.isStructured() && question.query().isEditable();

  const limit = canChangeLimit
    ? (question.query() as StructuredQuery).limit()
    : null;

  return (
    <PopoverWithTrigger
      triggerElement={
        <RowCountLabel
          className={className}
          highlighted={limit != null}
          disabled={!canChangeLimit}
        >
          {message}
        </RowCountLabel>
      }
      disabled={!canChangeLimit}
    >
      {({ onClose }: { onClose: () => void }) => (
        <LimitPopover
          className="p2"
          limit={limit}
          onChangeLimit={handleLimitChange}
          onClose={onClose}
        />
      )}
    </PopoverWithTrigger>
  );
}

function RowCountLabel({
  disabled,
  ...props
}: {
  children: string;
  highlighted: boolean;
  disabled: boolean;
  className?: string;
}) {
  const label = t`Row count`;
  return disabled ? (
    <RowCountStaticLabel {...props} aria-label={label} />
  ) : (
    <RowCountButton {...props} aria-label={label} />
  );
}

const formatRowCount = (count: number) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

function getLimitMessage(query: StructuredQuery, result: Dataset): string {
  const limit = query.limit();
  const hasRowCount = typeof result.row_count === "number";

  const isValidLimit =
    typeof limit === "number" && limit > 0 && limit < HARD_ROW_LIMIT;

  if (isValidLimit) {
    return t`Show ${formatRowCount(limit)}`;
  }

  if (hasRowCount) {
    // The query has been altered but we might still have the old result set,
    // so show that instead of a generic HARD_ROW_LIMIT
    return t`Showing ${formatRowCount(result.row_count)}`;
  }

  return t`Showing first ${HARD_ROW_LIMIT} rows`;
}

function getRowCountMessage(result: Dataset): string {
  if (result.data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(result.row_count)}`;
  }
  if (result.row_count === HARD_ROW_LIMIT) {
    return t`Showing first ${HARD_ROW_LIMIT} rows`;
  }
  return t`Showing ${formatRowCount(result.row_count)}`;
}

const ConnectedQuestionRowCount = connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionRowCount);

function shouldRender({
  question,
  result,
  isObjectDetail,
}: {
  question: Question;
  result?: Dataset;
  isObjectDetail: boolean;
}) {
  return (
    result && result.data && !isObjectDetail && question.display() === "table"
  );
}

export default Object.assign(ConnectedQuestionRowCount, { shouldRender });
