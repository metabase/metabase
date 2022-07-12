import _ from "underscore";
import { t } from "ttag";
import { push } from "react-router-redux";

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
import Actions from "metabase/entities/actions";
import {
  HttpActionErrorHandle,
  HttpActionResponseHandle,
  HttpActionTemplate,
} from "metabase/writeback/types";
import {
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/types/Parameter";

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

export type CreateHttpActionPayload = {
  name: string;
  description: string;
  template: HttpActionTemplate;
  response_handle: HttpActionResponseHandle;
  error_handle: HttpActionErrorHandle;
  parameters: Record<ParameterId, Parameter>;
  parameter_mappings: Record<ParameterId, ParameterTarget>;
};

export const createHttpAction = (payload: CreateHttpActionPayload) => async (
  dispatch: Dispatch,
  getState: GetState,
) => {
  const {
    name,
    description,
    template,
    error_handle = null,
    response_handle = null,
    parameters,
    parameter_mappings,
  } = payload;
  const data = {
    method: template.method || "GET",
    url: template.url,
    body: template.body || {},
    headers: JSON.stringify(template.headers || {}),
    parameters: template.parameters || {},
    parameter_mappings: template.parameter_mappings || {},
  };
  const newAction = {
    name,
    type: "http",
    description,
    template: data,
    error_handle,
    response_handle,
    parameters,
    parameter_mappings,
  };
  const response = await dispatch(Actions.actions.create(newAction));
  const action = Actions.HACK_getObjectFromAction(response);
  if (action.id) {
    dispatch(
      addUndo({
        message: t`Action saved!`,
      }),
    );
    dispatch(push(`/action/${action.id}`));
  } else {
    dispatch(
      addUndo({
        message: t`Could not save action`,
      }),
    );
  }
};
