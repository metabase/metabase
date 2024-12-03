import _ from "underscore";

import { onCloseQuestionInfo } from "metabase/query_builder/actions";
import { getIsShowingRawTable } from "metabase/query_builder/selectors";
import { syncVizSettingsWithQuery } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import { getPersistableDefaultSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";
import type { GetState, QueryBuilderMode } from "metabase-types/store";

/**
 * Saves to `visualization_settings` property of a question those visualization settings that
 * 1) don't have a value yet and 2) have `persistDefault` flag enabled.
 *
 * Needed for persisting visualization columns for pulses/alerts, see metabase#6749.
 */
export function getQuestionWithDefaultVisualizationSettings(
  question: Question,
  series: Series,
) {
  const oldVizSettings = question.settings();
  const newVizSettings = {
    ...oldVizSettings,
    ...getPersistableDefaultSettingsForSeries(series),
  };

  // Don't update the question unnecessarily
  // (even if fields values haven't changed, updating the settings will make the question appear dirty)
  if (!_.isEqual(oldVizSettings, newVizSettings)) {
    return question.setSettings(newVizSettings);
  } else {
    return question;
  }
}

export function getAdHocQuestionWithVizSettings(options: {
  question: Question;
  currentQuestion?: Question;
  shouldStartAdHocQuestion?: boolean;
  onCloseQuestionInfo?: () => void;
}) {
  const { shouldStartAdHocQuestion = false, currentQuestion } = options;
  let { question } = options;

  const { isEditable } = Lib.queryDisplayInfo(question.query());

  const shouldTurnIntoAdHoc =
    shouldStartAdHocQuestion && question.isSaved() && isEditable;

  if (shouldTurnIntoAdHoc) {
    question = question.withoutNameAndId();

    // When the dataset query changes, we should change the question type,
    // to start building a new ad-hoc question based on a dataset
    if (question.type() === "model" || question.type() === "metric") {
      question = question.setType("question");
      onCloseQuestionInfo?.();
    }
  }

  if (currentQuestion) {
    question = question.setSettings(
      syncVizSettingsWithQuery(
        question.settings(),
        question.query(),
        currentQuestion.query(),
      ),
    );
  }

  return question;
}

export const getViewFooterControlInitialState = (
  { queryBuilderMode }: { queryBuilderMode: QueryBuilderMode },
  getState: GetState,
) => {
  const isShowingRawTable = getIsShowingRawTable(getState());
  const viewFooterControlState =
    queryBuilderMode === "notebook"
      ? "editor"
      : isShowingRawTable
        ? "results"
        : "visualization";

  return viewFooterControlState;
};
