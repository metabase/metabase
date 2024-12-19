/* eslint-disable react/prop-types */
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

const PREVIEW_ROWS_LIMIT = 10;

const getPreviewQuestion = step => {
  const { previewQuery, stageIndex } = step;
  const limit = Lib.currentLimit(previewQuery, stageIndex);
  const hasSuitableLimit = limit !== null && limit <= PREVIEW_ROWS_LIMIT;
  const queryWithLimit = hasSuitableLimit
    ? previewQuery
    : Lib.limit(previewQuery, stageIndex, PREVIEW_ROWS_LIMIT);

  return Question.create()
    .setQuery(queryWithLimit)
    .setDisplay("table")
    .setSettings({ "table.pivot": false });
};

export const NotebookStepPreview = ({ step, onClose }) => {
  const previewQuestion = useMemo(() => getPreviewQuestion(step), [step]);
  const [activeQuestion, setActiveQuestion] = useState(previewQuestion);

  const refresh = () => {
    setActiveQuestion(previewQuestion);
  };

  const isDirty = useMemo(
    () => activeQuestion.isDirtyComparedTo(previewQuestion),
    [activeQuestion, previewQuestion],
  );

  return (
    <Box pt="md" data-testid="preview-root">
      <Flex justify="space-between" align="center" mb="sm">
        <span className={CS.textBold}>{t`Preview`}</span>
        <Flex align="flex-end">
          <Icon
            name="close"
            onClick={onClose}
            className={cx(
              CS.textLight,
              CS.textMediumHover,
              CS.cursorPointer,
              CS.ml1,
            )}
          />
        </Flex>
      </Flex>
      {isDirty ? (
        <Flex
          align="center"
          justify="center"
          className={cx(
            CS.bordered,
            CS.shadowed,
            CS.rounded,
            CS.bgWhite,
            CS.p4,
          )}
        >
          <Button onClick={refresh}>{t`Refresh`}</Button>
        </Flex>
      ) : (
        <QuestionResultLoader question={activeQuestion}>
          {({ rawSeries, result, error }) => (
            <VisualizationPreview
              rawSeries={rawSeries}
              result={result}
              error={error}
            />
          )}
        </QuestionResultLoader>
      )}
    </Box>
  );
};

export const VisualizationPreview = ({ rawSeries, result, error }) => {
  const err = getErrorMessage(error || result?.error);

  return (
    <Visualization
      rawSeries={rawSeries}
      error={err}
      className={cx(CS.bordered, CS.shadowed, CS.rounded, CS.bgWhite, {
        [CS.p2]: err,
      })}
      style={{
        height: err ? "auto" : getPreviewHeightForResult(result),
      }}
    />
  );
};

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * 36 + 36 + 2;
}

function getErrorMessage(err) {
  if (!err) {
    return null;
  }

  if (typeof err === "string") {
    return err;
  }

  if (typeof err.message === "string") {
    return err.message;
  }

  return t`Could not fetch preview`;
}
