import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import CS from "metabase/css/core/index.css";
import { HEADER_HEIGHT, ROW_HEIGHT } from "metabase/data-grid/constants";
import {
  type DraftQuestionBuilder,
  useQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { ActionIcon, Box, Flex, Icon, Tooltip } from "metabase/ui";
import { getScrollBarSize } from "metabase/utils/dom";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import type { NotebookStep } from "../../../types";

import { FocusedPreview } from "./FocusedPreview";
import S from "./NotebookStepPreview.module.css";
import type { QuestionResultLoaderChildrenProps } from "./QuestionResultLoader";
import { QuestionResultLoader } from "./QuestionResultLoader";
import { hasFocusedPreview } from "./focused-preview";
import PlayIcon from "./play.svg?component";

const PREVIEW_ROWS_LIMIT = 10;

const getPreviewQuestion = (
  step: NotebookStep,
  buildQuestion: DraftQuestionBuilder,
) => {
  const { stageIndex } = step;
  const previewQuery = checkNotNull(step.previewQuery);
  const limit = Lib.currentLimit(previewQuery, stageIndex);
  const hasSuitableLimit = limit !== null && limit <= PREVIEW_ROWS_LIMIT;
  const queryWithLimit = hasSuitableLimit
    ? previewQuery
    : Lib.limit(previewQuery, stageIndex, PREVIEW_ROWS_LIMIT);

  return buildQuestion({ dataset_query: Lib.toJsQuery(queryWithLimit) })
    .setDisplay("table")
    .setSettings({ "table.pivot": false });
};

type NotebookStepPreviewProps = {
  step: NotebookStep;
  /** A new id shows the step's query as it is now, without Refresh. */
  runId?: number;
  /** While true, the preview follows the step's query, without Refresh. */
  isLive?: boolean;
  onClose: () => void;
};

export const NotebookStepPreview = ({
  step,
  runId,
  isLive = false,
  onClose,
}: NotebookStepPreviewProps) => {
  const buildQuestion = useQuestionFromOptsBuilder();
  const previewQuestion = useMemo(
    () => getPreviewQuestion(step, buildQuestion),
    [step, buildQuestion],
  );
  const [activeQuestion, setActiveQuestion] = useState(previewQuestion);
  const [shownRunId, setShownRunId] = useState(runId);
  if (runId !== shownRunId) {
    setShownRunId(runId);
    setActiveQuestion(previewQuestion);
  } else if (isLive && activeQuestion.isDirtyComparedTo(previewQuestion)) {
    setActiveQuestion(previewQuestion);
  }

  const refresh = () => {
    setActiveQuestion(previewQuestion);
  };

  const isDirty = useMemo(
    () => activeQuestion.isDirtyComparedTo(previewQuestion),
    [activeQuestion, previewQuestion],
  );

  return (
    <Box pt="lg" data-testid="preview-root">
      <Flex justify="space-between" align="center" mb="sm">
        <span className={CS.textBold}>{t`Preview`}</span>
        <Flex align="flex-end">
          <Icon
            name="close"
            onClick={onClose}
            className={cx(
              CS.textSecondaryHoverPrimary,
              CS.cursorPointer,
              CS.ml1,
            )}
          />
        </Flex>
      </Flex>
      {/* An outdated preview keeps its rows, faded, with a button on them
          that runs it again, so that the layout does not shift. */}
      <div className={cx(S.preview, { [S.outdated]: isDirty })}>
        <div className={S.body} inert={isDirty}>
          <FocusedPreview
            // Custom column, filter and summarize steps show what their
            // expressions use and give, as the inline editor's preview did.
            query={hasFocusedPreview(step.type) ? activeQuestion.query() : null}
            stageIndex={step.stageIndex}
            type={step.type}
            fallback={
              <QuestionResultLoader question={activeQuestion}>
                {({ rawSeries, result, error }) => (
                  <VisualizationPreview
                    rawSeries={rawSeries}
                    result={result}
                    error={error}
                  />
                )}
              </QuestionResultLoader>
            }
          />
        </div>
        {isDirty && (
          <Tooltip label={t`Refresh`}>
            <ActionIcon
              className={S.runButton}
              variant="filled"
              color="brand"
              size="lg"
              radius="xl"
              aria-label={t`Refresh`}
              onClick={refresh}
            >
              <PlayIcon />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
    </Box>
  );
};

type VisualizationPreviewProps = Pick<
  QuestionResultLoaderChildrenProps,
  "rawSeries" | "result" | "error"
>;

export const VisualizationPreview = ({
  rawSeries,
  result,
  error,
}: VisualizationPreviewProps) => {
  const errorPayload = error || result?.error;
  const err = errorPayload
    ? getErrorMessage(errorPayload, t`Could not fetch preview`)
    : null;

  return (
    <Visualization
      rawSeries={rawSeries ?? undefined}
      error={err}
      queryBuilderMode="notebook"
      className={cx(
        S.PreviewVisualization,
        CS.bordered,
        CS.shadowed,
        CS.rounded,
        CS.bgWhite,
        {
          [CS.p2]: err,
        },
      )}
      style={{
        height: err ? "auto" : getPreviewHeightForResult(result),
      }}
    />
  );
};

function getPreviewHeightForResult(result: Dataset | null) {
  const rowCount = result ? result.data.rows.length : 1;
  return rowCount * ROW_HEIGHT + HEADER_HEIGHT + getScrollBarSize() + 2;
}
