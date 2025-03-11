import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import { noop } from "underscore";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import {
  LimitPopover,
  useCustomQuestionRowLimit,
} from "metabase/query_builder/components/LimitPopover";
import {
  getFirstQueryResult,
  getIsResultDirty,
  getQuestion,
} from "metabase/query_builder/selectors";
import { Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import type { Dataset } from "metabase-types/api";

const POPOVER_ID = "limit-popover";

export function QuestionRowCount({ className }: { className?: string }) {
  // Not expected to render before question is loaded
  const question = useSelector(getQuestion) as Question;
  const result = useSelector(getFirstQueryResult);
  const isResultDirty = useSelector(getIsResultDirty);

  const { isLoading } = useGetDatabaseQuery(
    question?.databaseId()
      ? {
          id: question.databaseId() as number,
        }
      : skipToken,
  );

  const [opened, { close, toggle }] = useDisclosure();

  const { isNative } = Lib.queryDisplayInfo(question.query());
  const message = useMemo(() => {
    if (isNative) {
      return isResultDirty ? "" : getRowCountMessage(result);
    }
    return isResultDirty
      ? getLimitMessage(question, result)
      : getRowCountMessage(result);
  }, [question, result, isResultDirty, isNative]);

  const { limit, canChangeLimit } = useCustomQuestionRowLimit({ question });
  const disabled = !canChangeLimit;

  if (isLoading) {
    return null;
  }

  return (
    <Popover
      disabled={disabled}
      id={POPOVER_ID}
      opened={opened}
      onChange={toggle}
      position="top-end"
    >
      <Popover.Target>
        <Text
          data-testid="question-row-count"
          fw="bold"
          lh="normal"
          ta="center"
          className={cx(
            CS.textMedium,
            CS.textBrandHover,
            {
              [CS.textBrand]: limit !== null,
              [CS.cursorPointer]: !disabled,
              [CS.cursorDefault]: disabled,
            },
            className,
          )}
          aria-label={t`Row count`}
          aria-haspopup="dialog"
          aria-controls={POPOVER_ID}
          onClick={!disabled ? toggle : noop}
        >
          {message}
        </Text>
      </Popover.Target>
      <Popover.Dropdown>
        <LimitPopover question={question} onClose={close} p="md" />
      </Popover.Dropdown>
    </Popover>
  );
}

const formatRowCount = (count: number) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

function getLimitMessage(question: Question, result: Dataset): string {
  const limit = Lib.currentLimit(question.query(), -1);
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

export type QuestionRowCountOpts = {
  result?: Dataset;
  isObjectDetail: boolean;
};

function shouldRender({ result, isObjectDetail }: QuestionRowCountOpts) {
  return result?.data && !isObjectDetail;
}

QuestionRowCount.shouldRender = shouldRender;
