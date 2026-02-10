import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { Series } from "metabase-types/api";
import type {
  Dispatch,
  GetState,
  QueryBuilderMode,
} from "metabase-types/store";

import {
  getIsShowingTemplateTagsEditor,
  getQueryBuilderMode,
  getQuestion,
  getRawSeries,
} from "../../selectors";
import { runQuestionQuery } from "../querying";
import { onCloseQuestionInfo, setQueryBuilderMode, setUIControls } from "../ui";
import { updateUrl } from "../url";

import { setIsShowingTemplateTagsEditor } from "./native";
import { computeQuestionPivotTable } from "./pivot-table";
import { getAdHocQuestionWithVizSettings } from "./utils";

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
  const isCurrentQuestionNative =
    currentQuestion && Lib.queryDisplayInfo(currentQuestion.query()).isNative;
  const isNewQuestionNative = Lib.queryDisplayInfo(
    newQuestion.query(),
  ).isNative;

  const previousTags = isCurrentQuestionNative
    ? (
        currentQuestion.legacyNativeQuery() as NativeQuery
      ).variableTemplateTags()
    : [];
  const nextTags = isNewQuestionNative
    ? (newQuestion.legacyNativeQuery() as NativeQuery).variableTemplateTags()
    : [];
  if (nextTags.length > previousTags.length) {
    return true;
  } else if (nextTags.length === 0) {
    return false;
  }
  return isVisible;
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

    newQuestion = getAdHocQuestionWithVizSettings({
      question: newQuestion,
      currentQuestion,
      onCloseQuestionInfo: () => dispatch(onCloseQuestionInfo()),
      shouldStartAdHocQuestion:
        shouldStartAdHocQuestion && queryBuilderMode !== "dataset",
    });

    if (!newQuestion.canAutoRun()) {
      run = false;
    }

    const rawSeries = getRawSeries(getState()) as Series;

    const computedPivotQuestion = computeQuestionPivotTable({
      question: newQuestion,
      currentQuestion,
      rawSeries,
    });

    newQuestion = computedPivotQuestion.question;

    if (computedPivotQuestion.shouldRun !== null) {
      run = computedPivotQuestion.shouldRun;
    }

    const isNewQuestionNative = Lib.queryDisplayInfo(
      newQuestion.query(),
    ).isNative;

    // Native query should never be in notebook mode (metabase#12651)
    if (queryBuilderMode === "notebook" && isNewQuestionNative) {
      await dispatch(
        setQueryBuilderMode("view", {
          shouldUpdateUrl: false,
        }),
      );
    }

    newQuestion = newQuestion.applyTemplateTagParameters();

    await dispatch({
      type: UPDATE_QUESTION,
      payload: { card: newQuestion.card() },
    });

    if (shouldUpdateUrl) {
      dispatch(updateUrl(null, { dirty: true }));
    }

    const isCurrentQuestionNative =
      currentQuestion && Lib.queryDisplayInfo(currentQuestion.query()).isNative;

    if (isCurrentQuestionNative || isNewQuestionNative) {
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
      ? Lib.dependentMetadata(
          currentQuestion.query(),
          currentQuestion.id(),
          currentQuestion.type(),
        )
      : [];
    const nextDependencies = Lib.dependentMetadata(
      newQuestion.query(),
      newQuestion.id(),
      newQuestion.type(),
    );
    if (!_.isEqual(currentDependencies, nextDependencies)) {
      await dispatch(loadMetadataForCard(newQuestion.card()));
    }

    if (run) {
      dispatch(runQuestionQuery());
    }
  };
};

// just using the entity action doesn't cause the question/model to live update
// also calling updateQuestion ensures the view matches the server state
export const SET_ARCHIVED_QUESTION = "metabase/question/SET_ARCHIVED_QUESTION";
export const setArchivedQuestion = createThunkAction(
  SET_ARCHIVED_QUESTION,
  function (question, archived = true) {
    return async function (dispatch) {
      await dispatch(
        updateQuestion(question.setArchived(archived), {
          shouldUpdateUrl: false,
          shouldStartAdHocQuestion: false,
          // results can change after entering/leaving the trash
          // due to references to questions in the trash or, so rerun after change
          run: true,
        }),
      );

      if (archived) {
        dispatch(setUIControls({ isNativeEditorOpen: false }));
      }
    };
  },
);
