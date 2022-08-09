import { createAction } from "redux-actions";
import _ from "underscore";
import { merge } from "icepick";
import { t } from "ttag";

import { isLocalField, isSameField } from "metabase/lib/query/field_ref";

import { addUndo } from "metabase/redux/undo";

import { getOriginalCard, getQuestion, getResultsMetadata } from "../selectors";

import { apiUpdateQuestion, updateQuestion } from "./core";
import { runQuestionQuery } from "./querying";
import { setQueryBuilderMode } from "./ui";

export const setDatasetEditorTab = datasetEditorTab => dispatch => {
  dispatch(setQueryBuilderMode("dataset", { datasetEditorTab }));
};

export const CANCEL_DATASET_CHANGES = "metabase/qb/CANCEL_DATASET_CHANGES";
export const onCancelDatasetChanges = () => (dispatch, getState) => {
  const cardBeforeChanges = getOriginalCard(getState());
  dispatch.action(CANCEL_DATASET_CHANGES, {
    card: cardBeforeChanges,
  });
  dispatch(runQuestionQuery());
};

export const turnQuestionIntoDataset = () => async (dispatch, getState) => {
  const question = getQuestion(getState());
  const dataset = question.setDataset(true);
  await dispatch(apiUpdateQuestion(dataset, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a model now.`,
      actions: [apiUpdateQuestion(question, { rerunQuery: true })],
    }),
  );
};

export const turnDatasetIntoQuestion = () => async (dispatch, getState) => {
  const dataset = getQuestion(getState());
  const question = dataset.setDataset(false);
  await dispatch(apiUpdateQuestion(question, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a question now.`,
      actions: [apiUpdateQuestion(dataset, { rerunQuery: true })],
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
      const compareExact =
        !isLocalField(field_ref) || !isLocalField(fieldMetadata.field_ref);
      const isTargetField = isSameField(
        field_ref,
        fieldMetadata.field_ref,
        compareExact,
      );
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
