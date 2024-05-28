import { merge } from "icepick";
import { push } from "react-router-redux";
import { createAction } from "redux-actions";
import { t } from "ttag";

import Questions from "metabase/entities/questions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { isSameField } from "metabase-lib/v1/queries/utils/field-ref";

import { getOriginalCard, getQuestion, getResultsMetadata } from "../selectors";

import { apiUpdateQuestion, updateQuestion, API_UPDATE_QUESTION } from "./core";
import { runDirtyQuestionQuery, runQuestionQuery } from "./querying";
import { setQueryBuilderMode } from "./ui";

export const setDatasetEditorTab = datasetEditorTab => dispatch => {
  dispatch(setQueryBuilderMode("dataset", { datasetEditorTab }));
  dispatch(runDirtyQuestionQuery());
};

export const onCancelCreateNewModel = () => async dispatch => {
  await dispatch(push("/"));
};

export const CANCEL_DATASET_CHANGES = "metabase/qb/CANCEL_DATASET_CHANGES";
export const onCancelDatasetChanges = () => (dispatch, getState) => {
  const cardBeforeChanges = getOriginalCard(getState());
  dispatch({
    type: CANCEL_DATASET_CHANGES,
    payload: { card: cardBeforeChanges },
  });
  dispatch(runDirtyQuestionQuery());
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

export const turnDatasetIntoQuestion = () => async (dispatch, getState) => {
  const dataset = getQuestion(getState());
  const question = dataset.setType("question");
  await dispatch(apiUpdateQuestion(question, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a question now.`,
      actions: [apiUpdateQuestion(dataset)],
    }),
  );
};

export const SET_RESULTS_METADATA = "metabase/qb/SET_RESULTS_METADATA";
export const setResultsMetadata = createAction(SET_RESULTS_METADATA);

export const SET_METADATA_DIFF = "metabase/qb/SET_METADATA_DIFF";
export const setMetadataDiff = createAction(SET_METADATA_DIFF);

export const setFieldMetadata =
  ({ field_ref, changes }) =>
  (dispatch, getState) => {
    const question = getQuestion(getState());
    const resultsMetadata = getResultsMetadata(getState());

    const nextColumnMetadata = resultsMetadata.columns.map(fieldMetadata => {
      const isTargetField = isSameField(field_ref, fieldMetadata.field_ref);
      return isTargetField ? merge(fieldMetadata, changes) : fieldMetadata;
    });

    const nextResultsMetadata = {
      ...resultsMetadata,
      columns: nextColumnMetadata,
    };

    const nextQuestion = question.setResultsMetadata(nextResultsMetadata);

    dispatch(updateQuestion(nextQuestion));
    dispatch(setMetadataDiff({ field_ref, changes }));
    dispatch(setResultsMetadata(nextResultsMetadata));
  };

export const onModelPersistenceChange = isEnabled => (dispatch, getState) => {
  const question = getQuestion(getState());
  const nextQuestion = question.setPersisted(isEnabled);
  dispatch(updateQuestion(nextQuestion, { shouldStartAdHocQuestion: false }));
};
