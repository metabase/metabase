import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import { MetabotApi } from "metabase/services";
import { Dispatch, GetState } from "metabase-types/store";
import {
  getEntityId,
  getEntityType,
  getFeedbackType,
  getNativeQueryText,
  getOriginalNativeQueryText,
  getPrompt,
  getQuestion,
} from "./selectors";

export const INIT = "metabase/metabot/INIT";
export const init = createAction(INIT);

export const RESET = "metabase/metabot/RESET";
export const reset = createAction(RESET);

export const SET_PROMPT_TEXT = "metabase/metabot/SET_PROMPT_TEXT";
export const setPromptText = createAction(SET_PROMPT_TEXT);

export const SET_FEEDBACK_TYPE = "metabase/metabot/SET_FEEDBACK_TYPE";
export const setFeedbackType = createAction(SET_FEEDBACK_TYPE);

export const RUN_QUERY = "metabase/metabot/RUN_QUERY";
export const runQuery = createAction(RUN_QUERY);

export const QUERY_COMPLETED = "metabase/metabot/QUERY_COMPLETED";
export const queryCompleted = createAction(QUERY_COMPLETED);

export const RUN_TEXT_QUERY = "metabase/metabot/RUN_TEXT_QUERY";
export const runTextQuery = createThunkAction(
  RUN_TEXT_QUERY,
  () => async (dispatch: Dispatch) => {
    dispatch(runQuery());
    await dispatch(fetchCard());
    await dispatch(fetchQueryResults());
    dispatch(queryCompleted());
  },
);

export const RUN_CARD_QUERY = "metabase/metabot/RUN_CARD_QUERY";
export const runCardQuery = createThunkAction(
  RUN_CARD_QUERY,
  () => async (dispatch: Dispatch) => {
    dispatch(runQuery());
    await dispatch(fetchQueryResults());
    dispatch(queryCompleted());
  },
);

export const FETCH_CARD = "metabase/metabot/FETCH_CARD";
export const fetchCard = createThunkAction(
  FETCH_CARD,
  () => async (_dispatch: Dispatch, getState: GetState) => {
    const entityId = getEntityId(getState());
    const entityType = getEntityType(getState());
    const prompt = getPrompt(getState());

    if (entityType === "model") {
      return await MetabotApi.modelPrompt({
        modelId: entityId,
        question: prompt,
      });
    } else {
      return await MetabotApi.databasePrompt({
        databaseId: entityId,
        question: prompt,
      });
    }
  },
);

export const FETCH_QUERY_RESULTS = "metabase/metabot/FETCH_QUERY_RESULTS";
export const fetchQueryResults = createThunkAction(
  FETCH_QUERY_RESULTS,
  () => async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    return await question?.apiGetResults();
  },
);

export const SUBMIT_FEEDBACK = "metabase/metabot/SUBMIT_FEEDBACK";
export const sumbitFeedback = createThunkAction(
  SUBMIT_FEEDBACK,
  (message?: string) => async (_dispatch: Dispatch, getState: GetState) => {
    const feedback = getFeedbackType(getState());
    const prompt = getPrompt(getState());
    const entity_type = getEntityType(getState());
    const sql = getOriginalNativeQueryText(getState());
    const correct_sql = getNativeQueryText(getState());

    return await MetabotApi.sendFeedback({
      message,
      entity_type,
      feedback,
      prompt,
      sql,
      correct_sql,
    });
  },
);
