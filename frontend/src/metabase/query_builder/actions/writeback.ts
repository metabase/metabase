import _ from "underscore";
import { t } from "ttag";
import { push } from "react-router-redux";

import { addUndo } from "metabase/redux/undo";

import { Dispatch, GetState } from "metabase-types/store";

import { getQuestion } from "../selectors";

import { apiUpdateQuestion } from "./core";
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

export const turnQuestionIntoAction =
  () => async (dispatch: Dispatch, getState: GetState) => {
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

export const turnActionIntoQuestion =
  () => async (dispatch: Dispatch, getState: GetState) => {
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

export const createHttpAction =
  (payload: CreateHttpActionPayload) =>
  async (dispatch: Dispatch, getState: GetState) => {
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
      body: template.body || JSON.stringify({}),
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
