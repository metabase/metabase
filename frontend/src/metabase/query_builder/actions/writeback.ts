import _ from "underscore";
import { t } from "ttag";

import { addUndo } from "metabase/redux/undo";
import {
  createRow,
  updateRow,
  deleteRow,
  InsertRowPayload,
  UpdateRowPayload,
  DeleteRowPayload,
} from "metabase/writeback/actions";

import { Dispatch, GetState } from "metabase-types/store";

import { getQuestion } from "../selectors";

import { apiUpdateQuestion } from "./core";
import { closeObjectDetail } from "./object-detail";
import { runQuestionQuery } from "./querying";
import { setUIControls } from "./ui";

export const INSERT_ROW_FROM_TABLE_VIEW =
  "metabase/qb/INSERT_ROW_FROM_TABLE_VIEW";
export const createRowFromTableView = (payload: InsertRowPayload) => {
  return async (dispatch: any) => {
    const result = await createRow(payload);
    dispatch.action(INSERT_ROW_FROM_TABLE_VIEW, payload);
    if (result?.["created-row"]?.id) {
      dispatch(setUIControls({ modal: null, modalContext: null }));
      dispatch(runQuestionQuery());
    }
  };
};

export const UPDATE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/UPDATE_ROW_FROM_OBJECT_DETAIL";
export const updateRowFromObjectDetail = (payload: UpdateRowPayload) => {
  return async (dispatch: any) => {
    const result = await updateRow(payload);
    dispatch.action(UPDATE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-updated"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};

export const DELETE_ROW_FROM_OBJECT_DETAIL =
  "metabase/qb/DELETE_ROW_FROM_OBJECT_DETAIL";
export const deleteRowFromObjectDetail = (payload: DeleteRowPayload) => {
  return async (dispatch: any) => {
    const result = await deleteRow(payload);

    dispatch.action(DELETE_ROW_FROM_OBJECT_DETAIL, payload);
    if (result?.["rows-deleted"]?.length > 0) {
      dispatch(closeObjectDetail());
      dispatch(runQuestionQuery());
    }
  };
};

export const turnQuestionIntoAction = () => async (
  dispatch: Dispatch,
  getState: GetState,
) => {
  const question = getQuestion(getState());
  const action = question?.setIsAction(true);
  await dispatch(apiUpdateQuestion(action));

  dispatch(
    addUndo({
      message: t`This is an action now.`,
      actions: [apiUpdateQuestion(question, { rerunQuery: true })],
    }),
  );
};

export const turnActionIntoQuestion = () => async (
  dispatch: Dispatch,
  getState: GetState,
) => {
  const action = getQuestion(getState());
  const question = action?.setIsAction(false);
  await dispatch(apiUpdateQuestion(question, { rerunQuery: true }));

  dispatch(
    addUndo({
      message: t`This is a question now.`,
      actions: [apiUpdateQuestion(action, { rerunQuery: true })],
    }),
  );
};
