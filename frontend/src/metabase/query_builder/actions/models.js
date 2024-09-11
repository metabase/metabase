import { push } from "react-router-redux";
import { createAction } from "redux-actions";
import { t } from "ttag";

import Questions from "metabase/entities/questions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";

import { getQuestion } from "../selectors";

import { API_UPDATE_QUESTION, apiUpdateQuestion, updateQuestion } from "./core";
import { runDirtyQuestionQuery, runQuestionQuery } from "./querying";
import { setQueryBuilderMode } from "./ui";

export const setDatasetEditorTab = datasetEditorTab => dispatch => {
  dispatch(
    setQueryBuilderMode("dataset", { datasetEditorTab, replaceState: false }),
  );
  dispatch(runDirtyQuestionQuery());
};

export const onCancelCreateNewModel = () => async dispatch => {
  await dispatch(push("/"));
};

export const turnQuestionIntoDataset = () => async (dispatch, getState) => {
  const question = getQuestion(getState());

  await dispatch(
    Questions.actions.update(
      {
        id: question.id(),
      },
      question.setType("model").setPinned(true).setDisplay("table").card(),
    ),
  );

  const metadata = getMetadata(getState());
  const dataset = metadata.question(question.id());

  await dispatch(loadMetadataForCard(dataset.card()));

  await dispatch({ type: API_UPDATE_QUESTION, payload: dataset.card() });

  await dispatch(
    runQuestionQuery({
      shouldUpdateUrl: true,
    }),
  );

  dispatch(
    addUndo({
      message: t`This is a model now.`,
      actions: [apiUpdateQuestion(question, { rerunQuery: true })],
    }),
  );
};

export const turnModelIntoQuestion = () => async (dispatch, getState) => {
  const model = getQuestion(getState());
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

export const onModelPersistenceChange = isEnabled => (dispatch, getState) => {
  const question = getQuestion(getState());
  const nextQuestion = question.setPersisted(isEnabled);
  dispatch(updateQuestion(nextQuestion, { shouldStartAdHocQuestion: false }));
};
