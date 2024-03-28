/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { Icon } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

import {
  PreviewButtonContainer,
  PreviewHeader,
  PreviewIconContainer,
  PreviewRoot,
} from "./NotebookStepPreview.styled";

const PREVIEW_ROWS_LIMIT = 10;

const getPreviewQuestion = step => {
  const { getPreviewQuery, stageIndex } = step;
  const query = getPreviewQuery();
  const limit = Lib.currentLimit(query, stageIndex);
  const hasSuitableLimit = limit !== null && limit <= PREVIEW_ROWS_LIMIT;
  const queryWithLimit = hasSuitableLimit
    ? query
    : Lib.limit(query, stageIndex, PREVIEW_ROWS_LIMIT);

  return Question.create()
    .setQuery(queryWithLimit)
    .setDisplay("table")
    .setSettings({ "table.pivot": false });
};

const NotebookStepPreview = ({ step, onClose }) => {
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
    <PreviewRoot data-testid="preview-root">
      <PreviewHeader>
        <span className={CS.textBold}>{t`Preview`}</span>
        <PreviewIconContainer>
          <Icon
            name="close"
            onClick={onClose}
            className={cx(
              CS.textLight,
              "text-medium-hover",
              CS.cursorPointer,
              CS.ml1,
            )}
          />
        </PreviewIconContainer>
      </PreviewHeader>
      {isDirty ? (
        <PreviewButtonContainer className="bordered shadowed rounded bg-white p4">
          <Button onClick={refresh}>{t`Refresh`}</Button>
        </PreviewButtonContainer>
      ) : (
        <QuestionResultLoader question={activeQuestion}>
          {({ rawSeries, result }) => (
            <VisualizationPreview rawSeries={rawSeries} result={result} />
          )}
        </QuestionResultLoader>
      )}
    </PreviewRoot>
  );
};

const VisualizationPreview = ({ rawSeries, result }) => {
  const { open } = useModalOpen();
  const preferReducedMotion = isReducedMotionPreferred();

  const transitionDuration = preferReducedMotion ? 80 : 700;

  return (
    <Visualization
      rawSeries={rawSeries}
      error={result && result.error}
      className={cx("bordered shadowed rounded bg-white", {
        p2: result && result.error,
      })}
      style={{
        height: open
          ? getPreviewHeightForResult(result)
          : getPreviewHeightForResult(result) / 2,
        transition: `height ${transitionDuration}ms cubic-bezier(0, 0, 0.2, 1)`,
      }}
    />
  );
};

function getPreviewHeightForResult(result) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * 36 + 36 + 2;
}

export default NotebookStepPreview;
