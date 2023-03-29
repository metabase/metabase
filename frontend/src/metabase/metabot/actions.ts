import { createAction } from "redux-actions";
import { MetabotApi } from "metabase/services";
import { MetabotFeedbackType } from "metabase-types/api";
import {
  Dispatch,
  GetState,
  MetabotEntityId,
  MetabotEntityType,
} from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  getEntityId,
  getEntityType,
  getFeedbackType,
  getNativeQueryText,
  getOriginalNativeQueryText,
  getPrompt,
  getQuestion,
} from "./selectors";

export interface InitPayload {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialPrompt?: string;
}

export const INIT = "metabase/metabot/INIT";
export const init = (payload: InitPayload) => (dispatch: Dispatch) => {
  dispatch({ type: INIT, payload });

  if (payload.initialPrompt) {
    dispatch(runPromptQuery());
  }
};

export const RESET = "metabase/metabot/RESET";
export const reset = createAction(RESET);

export const UPDATE_CARD = "metabase/metabot/UPDATE_CARD";
export const updateCard = createAction(UPDATE_CARD, (question: Question) =>
  question.card(),
);

export const UPDATE_PROMPT = "metabase/metabot/UPDATE_PROMPT";
export const updatePrompt = createAction(UPDATE_PROMPT);

export const RUN_QUERY = "metabase/metabot/RUN_QUERY";
export const runQuery = createAction(RUN_QUERY);

export const QUERY_COMPLETED = "metabase/metabot/QUERY_COMPLETED";
export const queryCompleted = createAction(QUERY_COMPLETED);

export const QUERY_ERRORED = "metabase/metabot/QUERY_ERRORED";
export const queryErrored = createAction(QUERY_ERRORED);

export const runPromptQuery = () => async (dispatch: Dispatch) => {
  try {
    dispatch(runQuery());
    await dispatch(fetchCard());
    await dispatch(fetchQueryResults());
  } catch (error) {
    dispatch(queryErrored(error));
  } finally {
    dispatch(queryCompleted());
  }
};

export const runCardQuery = () => async (dispatch: Dispatch) => {
  try {
    dispatch(runQuery());
    await dispatch(fetchQueryResults());
  } catch (error) {
    dispatch(queryErrored(error));
  } finally {
    dispatch(queryCompleted());
  }
};

export const FETCH_CARD = "metabase/metabot/FETCH_CARD";
export const fetchCard =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const entityId = getEntityId(getState());
    const entityType = getEntityType(getState());
    const question = getPrompt(getState());

    const payload =
      entityType === "model"
        ? await MetabotApi.modelPrompt({ modelId: entityId, question })
        : await MetabotApi.databasePrompt({ databaseId: entityId, question });

    dispatch({ type: FETCH_CARD, payload });
  };

export const FETCH_QUERY_RESULTS = "metabase/metabot/FETCH_QUERY_RESULTS";
export const fetchQueryResults =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    const payload = await question?.apiGetResults();
    dispatch({ type: FETCH_QUERY_RESULTS, payload });
  };

export const UPDATE_FEEDBACK_TYPE = "metabase/metabot/UPDATE_FEEDBACK_TYPE";
export const updateFeedbackType =
  (feedbackType: MetabotFeedbackType) => (dispatch: Dispatch) => {
    dispatch({ type: UPDATE_FEEDBACK_TYPE, payload: feedbackType });

    if (feedbackType === "great") {
      dispatch(submitFeedback());
    }
  };

export const submitFeedbackForm =
  (feedbackMessage: string) => (dispatch: Dispatch) => {
    dispatch(submitFeedback(feedbackMessage));
  };

export const submitQueryForm = () => (dispatch: Dispatch) => {
  dispatch(submitFeedback());
  dispatch(runCardQuery());
};

export const SUBMIT_FEEDBACK = "metabase/metabot/SUBMIT_FEEDBACK";
export const submitFeedback =
  (feedbackMessage?: string) => (dispatch: Dispatch, getState: GetState) => {
    const prompt = getPrompt(getState());
    const entityType = getEntityType(getState());
    const sql = getOriginalNativeQueryText(getState());
    const correctSql = getNativeQueryText(getState());
    const feedbackType = getFeedbackType(getState());

    MetabotApi.sendFeedback({
      entity_type: entityType,
      prompt,
      sql,
      feedback: feedbackType,
      message: feedbackMessage,
      correct_sql: feedbackType === "invalid-sql" ? correctSql : undefined,
    });

    dispatch({ type: SUBMIT_FEEDBACK });
  };
