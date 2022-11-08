import _ from "underscore";
import { t } from "ttag";

import { addUndo } from "metabase/redux/undo";

import { Dispatch, GetState } from "metabase-types/store";

import { getQuestion } from "../selectors";

import { apiUpdateQuestion } from "./core";

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
