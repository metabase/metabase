import _ from "underscore";
import { assocIn } from "icepick";

import { loadMetadataForCard } from "metabase/questions/actions";

import type { Series } from "metabase-types/api";
import type {
  Dispatch,
  GetState,
  QueryBuilderMode,
} from "metabase-types/store";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";

import {
  getFirstQueryResult,
  getIsShowingTemplateTagsEditor,
  getQueryBuilderMode,
  getQuestion,
  getRawSeries,
} from "../../selectors";

import { updateUrl } from "../navigation";
import { setIsShowingTemplateTagsEditor } from "../native";
import { runQuestionQuery } from "../querying";
import { onCloseQuestionInfo, setQueryBuilderMode } from "../ui";

import { getQuestionWithDefaultVisualizationSettings } from "./utils";

function checkShouldRerunPivotTableQuestion({
  isPivot,
  wasPivot,
  hasBreakouts,
  currentQuestion,
  newQuestion,
}: {
  isPivot: boolean;
  wasPivot: boolean;
  hasBreakouts: boolean;
  currentQuestion?: Question;
  newQuestion: Question;
}) {
  const isValidPivotTable = isPivot && hasBreakouts;
  const displayChange =
    (!wasPivot && isValidPivotTable) || (wasPivot && !isPivot);

  if (displayChange) {
    return true;
  }

  const currentPivotSettings = currentQuestion?.setting(
    "pivot_table.column_split",
  );
  const newPivotSettings = newQuestion.setting("pivot_table.column_split");
  return (
    isValidPivotTable && !_.isEqual(currentPivotSettings, newPivotSettings)
  );
}

function shouldTemplateTagEditorBeVisible({
  currentQuestion,
  newQuestion,
  isVisible,
  queryBuilderMode,
}: {
  currentQuestion?: Question;
  newQuestion: Question;
  isVisible: boolean;
  queryBuilderMode: QueryBuilderMode;
}): boolean {
  // variable tags are not supported by models, so don't change the visibility
  if (queryBuilderMode === "dataset") {
    return isVisible;
  }
  const previousTags = currentQuestion?.isNative()
    ? (currentQuestion.legacyQuery() as NativeQuery).variableTemplateTags()
    : [];
  const nextTags = newQuestion.isNative()
    ? (newQuestion.legacyQuery() as NativeQuery).variableTemplateTags()
    : [];
  if (nextTags.length > previousTags.length) {
    return true;
  } else if (nextTags.length === 0) {
    return false;
  } else {
    return isVisible;
  }
}

export type UpdateQuestionOpts = {
  run?: boolean;
  shouldUpdateUrl?: boolean;
  shouldStartAdHocQuestion?: boolean;
};

/**
 * Replaces the currently active question with the given Question object.
 */
export const UPDATE_QUESTION = "metabase/qb/UPDATE_QUESTION";
export const updateQuestion = (
  newQuestion: Question,
  {
    run = false,
    shouldStartAdHocQuestion = true,
    shouldUpdateUrl = false,
  }: UpdateQuestionOpts = {},
) => {
  return async (dispatch: Dispatch, getState: GetState) => {
    const currentQuestion = getQuestion(getState());
    const queryBuilderMode = getQueryBuilderMode(getState());

    const shouldTurnIntoAdHoc =
      shouldStartAdHocQuestion &&
      newQuestion.isSaved() &&
      newQuestion.isQueryEditable() &&
      queryBuilderMode !== "dataset";

    if (shouldTurnIntoAdHoc) {
      newQuestion = newQuestion.withoutNameAndId();

      // When the dataset query changes, we should loose the dataset flag,
      // to start building a new ad-hoc question based on a dataset
      if (newQuestion.isDataset()) {
        newQuestion = newQuestion.setDataset(false);
        dispatch(onCloseQuestionInfo());
      }
    }

    // This scenario happens because the DatasetQueryEditor converts the dataset/model question into a normal question
    // so that its query is shown properly in the notebook editor. Various child components of the notebook editor have access to
    // this `updateQuestion` action, so they end up triggering the action with the altered question.
    if (queryBuilderMode === "dataset" && !newQuestion.isDataset()) {
      newQuestion = newQuestion.setDataset(true);
    }

    const queryResult = getFirstQueryResult(getState());
    newQuestion = newQuestion.syncColumnsAndSettings(
      currentQuestion,
      queryResult,
    );

    if (!newQuestion.canAutoRun()) {
      run = false;
    }

    const isPivot = newQuestion.display() === "pivot";
    const wasPivot = currentQuestion?.display() === "pivot";

    if (wasPivot || isPivot) {
      const hasBreakouts =
        newQuestion.isStructured() &&
        Lib.breakouts(newQuestion.query(), -1).length > 0;

      // compute the pivot setting now so we can query the appropriate data
      if (isPivot && hasBreakouts) {
        const key = "pivot_table.column_split";
        const rawSeries = getRawSeries(getState()) as Series;

        if (rawSeries) {
          const series = assocIn(rawSeries, [0, "card"], newQuestion.card());
          const setting = getQuestionWithDefaultVisualizationSettings(
            newQuestion,
            series,
          ).setting(key);
          newQuestion = newQuestion.updateSettings({ [key]: setting });
        }
      }

      run = checkShouldRerunPivotTableQuestion({
        isPivot,
        wasPivot,
        hasBreakouts,
        currentQuestion,
        newQuestion,
      });
    }

    // Native query should never be in notebook mode (metabase#12651)
    if (queryBuilderMode === "notebook" && newQuestion.isNative()) {
      await dispatch(
        setQueryBuilderMode("view", {
          shouldUpdateUrl: false,
        }),
      );
    }

    // Sync card's parameters with the template tags;
    if (newQuestion.isNative()) {
      const parameters = getTemplateTagParametersFromCard(newQuestion.card());
      newQuestion = newQuestion.setParameters(parameters);
    }

    await dispatch({
      type: UPDATE_QUESTION,
      payload: { card: newQuestion.card() },
    });

    if (shouldUpdateUrl) {
      dispatch(updateUrl(null, { dirty: true }));
    }

    if (currentQuestion?.isNative?.() || newQuestion.isNative()) {
      const isVisible = getIsShowingTemplateTagsEditor(getState());
      const shouldBeVisible = shouldTemplateTagEditorBeVisible({
        currentQuestion,
        newQuestion,
        queryBuilderMode,
        isVisible,
      });
      if (isVisible !== shouldBeVisible) {
        dispatch(setIsShowingTemplateTagsEditor(shouldBeVisible));
      }
    }

    const currentDependencies = currentQuestion
      ? [
          ...currentQuestion.dependentMetadata(),
          ...currentQuestion
            .legacyQuery({ useStructuredQuery: true })
            .dependentMetadata(),
        ]
      : [];
    const nextDependencies = [
      ...newQuestion.dependentMetadata(),
      ...newQuestion
        .legacyQuery({ useStructuredQuery: true })
        .dependentMetadata(),
    ];
    try {
      if (!_.isEqual(currentDependencies, nextDependencies)) {
        await dispatch(loadMetadataForCard(newQuestion.card()));
      }

      // setDefaultQuery requires metadata be loaded, need getQuestion to use new metadata
      const question = getQuestion(getState()) as Question;
      const questionWithDefaultQuery = question.setDefaultQuery();
      if (!questionWithDefaultQuery.isEqual(question)) {
        await dispatch({
          type: UPDATE_QUESTION,
          payload: {
            card: questionWithDefaultQuery.setDefaultDisplay().card(),
          },
        });
      }
    } catch (e) {
      // this will fail if user doesn't have data permissions but thats ok
      console.warn("Couldn't load metadata", e);
    }

    if (run) {
      dispatch(runQuestionQuery());
    }
  };
};
