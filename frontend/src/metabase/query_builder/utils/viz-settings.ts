import _ from "underscore";

import { syncVizSettingsWithQuery } from "metabase/querying/viz-settings/utils/sync-viz-settings";
import { isNotNull } from "metabase/utils/types";
import {
  adoptLegacyCustomVizSettings,
  getPersistableDefaultSettingsForSeries,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";

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
  // Adopting a legacy custom viz key should not dirty the question
  const oldVizSettings = adoptLegacyCustomVizSettings(
    question.display(),
    question.settings(),
  );
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

/**
 * Whether `rawSeries` holds the results of the question's query, and not of an earlier query.
 * Settings that are computed from results, such as the pivot table's column split, are only
 * right when the results are of the same query.
 */
export function hasResultsOfQuestion(
  question: Question,
  rawSeries: Series | null | undefined,
) {
  const lastRunQuery = rawSeries?.[0]?.card.dataset_query;
  return (
    isNotNull(lastRunQuery) &&
    Lib.areQueriesEqual(question.datasetQuery(), lastRunQuery)
  );
}

/**
 * Returns `questionWithDefaults` with the pivot table's column split of `question` when `rawSeries`
 * holds the results of an earlier query. The defaults computed from such results drop the columns
 * that only the question's query has.
 */
export function keepPivotColumnSplitOfChangedQuery(
  question: Question,
  questionWithDefaults: Question,
  rawSeries: Series | null | undefined,
) {
  const key = "pivot_table.column_split";
  const columnSplit = question.settings()[key];
  if (!columnSplit || hasResultsOfQuestion(question, rawSeries)) {
    return questionWithDefaults;
  }
  return questionWithDefaults.updateSettings({ [key]: columnSplit });
}

export function getAdHocQuestionWithVizSettings(options: {
  question: Question;
  currentQuestion?: Question;
  isInPlaceColumnChange?: boolean;
  shouldStartAdHocQuestion?: boolean;
  onCloseQuestionInfo?: () => void;
}) {
  const {
    shouldStartAdHocQuestion = false,
    currentQuestion,
    onCloseQuestionInfo,
    isInPlaceColumnChange,
  } = options;
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
        { isInPlaceColumnChange },
      ),
    );
  }

  return question;
}
