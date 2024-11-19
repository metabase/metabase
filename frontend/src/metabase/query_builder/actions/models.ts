import { push } from "react-router-redux";
import { createAction } from "redux-actions";
import { t } from "ttag";

import { addUndo } from "metabase/redux/undo";
import type { Dispatch, GetState } from "metabase-types/store";

import { getQuestion } from "../selectors";

import { apiUpdateQuestion, updateQuestion } from "./core";
import { runDirtyQuestionQuery } from "./querying";
import { setQueryBuilderMode } from "./ui";

export const setDatasetEditorTab =
  (datasetEditorTab: "query" | "metadata") => (dispatch: Dispatch) => {
    dispatch(
      setQueryBuilderMode("dataset", { datasetEditorTab, replaceState: false }),
    );
    dispatch(runDirtyQuestionQuery());
  };

export const onCancelCreateNewModel = () => async (dispatch: Dispatch) => {
  await dispatch(push("/"));
};

export const turnQuestionIntoModel =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const model = question
      .setType("model")
      .setPinned(true)
      .setDisplay("table")
      .setSettings({});
    await dispatch(apiUpdateQuestion(model, { rerunQuery: true }));

    dispatch(
      addUndo({
        message: t`This is a model now.`,
        actions: [apiUpdateQuestion(question, { rerunQuery: true })],
      }),
    );
  };

export const turnModelIntoQuestion =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const model = getQuestion(getState());
    if (!model) {
      return;
    }

    const question = model.setType("question");
    await dispatch(apiUpdateQuestion(question, { rerunQuery: true }));

    dispatch(
      addUndo({
        message: t`This is a question now.`,
        actions: [apiUpdateQuestion(model)],
      }),
    );
  };

export const SET_METADATA_DIFF = "metabase/qb/SET_METADATA_DIFF";
export const setMetadataDiff = createAction(SET_METADATA_DIFF);

export const onModelPersistenceChange =
  (isEnabled: boolean) => (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());

    if (!question) {
      return;
    }

    const nextQuestion = question.setPersisted(isEnabled);
    dispatch(updateQuestion(nextQuestion, { shouldStartAdHocQuestion: false }));
  };
