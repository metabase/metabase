import React, { useMemo } from "react";
import { ngettext, msgid, t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { formatNumber } from "metabase/lib/formatting";
import Database from "metabase/entities/databases";

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

import * as Lib from "metabase-lib";
import { HARD_ROW_LIMIT } from "metabase-lib/queries/utils";
import type { Limit } from "metabase-lib/types";
import type Question from "metabase-lib/Question";

import { RowCountButton, RowCountStaticLabel } from "./QuestionRowCount.styled";

const POPOVER_ID = "limit-popover";

interface OwnProps {
  className?: string;
}

interface StateProps {
  question: Question;
  result: Dataset;
  isResultDirty: boolean;
}

interface EntityLoaderProps {
  loading: boolean;
}

interface DispatchProps {
  onChangeLimit: (limit: Limit) => void;
}

type QuestionRowCountProps = OwnProps &
  StateProps &
  DispatchProps &
  EntityLoaderProps;

function mapStateToProps(state: State) {
  // Not expected to render before question is loaded
  const question = getQuestion(state) as Question;

  return {
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
  loading,
  className,
  onChangeLimit,
}: QuestionRowCountProps) {
  const message = useMemo(() => {
    if (!question.isStructured()) {
      return isResultDirty ? "" : getRowCountMessage(result);
    }
    return isResultDirty
      ? getLimitMessage(question, result)
      : getRowCountMessage(result);
  }, [question, result, isResultDirty]);

  const handleLimitChange = (limit: number) => {
    onChangeLimit(limit > 0 ? limit : null);
  };

  const canChangeLimit =
    question.isStructured() && question.query().isEditable();

  const limit = canChangeLimit
    ? Lib.currentLimit(question._getMLv2Query(), -1)
    : null;

  if (loading) {
    return null;
  }

  return (
    <PopoverWithTrigger
      triggerElement={
        <RowCountLabel
          className={className}
          data-testid="question-row-count"
          highlighted={limit != null}
          disabled={!canChangeLimit}
        >
          {message}
        </RowCountLabel>
      }
      id={POPOVER_ID}
      aria-role="dialog"
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
    <RowCountButton
      {...props}
      aria-label={label}
      aria-haspopup="dialog"
      aria-controls={POPOVER_ID}
    />
  );
}

const formatRowCount = (count: number) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

function getLimitMessage(question: Question, result: Dataset): string {
  const limit = Lib.currentLimit(question._getMLv2Query(), -1);
  const isValidLimit =
    typeof limit === "number" && limit > 0 && limit < HARD_ROW_LIMIT;

  if (isValidLimit) {
    return t`Show ${formatRowCount(limit)}`;
  }

  const hasValidRowCount =
    typeof result.row_count === "number" && result.row_count > 0;

  if (hasValidRowCount) {
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

function getDatabaseId(state: State, { question }: OwnProps & StateProps) {
  return question.query().databaseId();
}

const ConnectedQuestionRowCount = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Database.load({
    id: getDatabaseId,
    loadingAndErrorWrapper: false,
  }),
)(QuestionRowCount);

function shouldRender({
  result,
  isObjectDetail,
}: {
  result?: Dataset;
  isObjectDetail: boolean;
}) {
  return result?.data && !isObjectDetail;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(ConnectedQuestionRowCount, { shouldRender });
