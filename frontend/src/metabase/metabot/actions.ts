import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import { MetabotApi } from "metabase/services";
import {
  Dispatch,
  GetState,
  MetabotEntityId,
  MetabotEntityType,
} from "metabase-types/store";
import {
  getEntityId,
  getEntityType,
  getQueryText,
  getQuestion,
} from "./selectors";

export const SET_ENTITY_ID = "metabase/metabot/SET_ENTITY_ID";
export const setEntityId = createAction(SET_ENTITY_ID);

export const SET_ENTITY_TYPE = "metabase/metabot/SET_ENTITY_TYPE";
export const setEntityType = createAction(SET_ENTITY_TYPE);

export const SET_QUERY_TEXT = "metabase/metabot/SET_QUERY_TEXT";
export const setQueryText = createAction(SET_QUERY_TEXT);

export const SET_QUERY_STATUS = "metabase/metabot/SET_QUERY_STATUS";
export const setQueryStatus = createAction(SET_QUERY_STATUS);

export const SET_QUERY_ERROR = "metabase/metabot/SET_QUERY_ERROR";
export const setQueryError = createAction(SET_QUERY_ERROR);

export const SET_FEEDBACK_TYPE = "metabase/metabot/SET_FEEDBACK_TYPE";
export const setFeedbackType = createAction(SET_FEEDBACK_TYPE);

export const RESET = "metabase/metabot/RESET";
export const reset = createAction(RESET);

export interface InitPayload {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialQueryText: string;
}

export const INIT = "metabase/metabot/INIT";
export const init = createThunkAction(
  INIT,
  ({ entityId, entityType, initialQueryText }: InitPayload) =>
    (dispatch: Dispatch) => {
      dispatch(setEntityId(entityId));
      dispatch(setEntityType(entityType));
      dispatch(setQueryText(initialQueryText));
    },
);

export const RUN_TEXT_QUERY = "metabase/metabot/RUN_TEXT_QUERY";
export const runTextQuery = createThunkAction(
  RUN_TEXT_QUERY,
  () => async (dispatch: Dispatch) => {
    try {
      dispatch(setQueryStatus("running"));
      await dispatch(fetchCard());
      await dispatch(fetchQueryResults());
    } catch (error) {
      dispatch(setQueryError(error));
    } finally {
      dispatch(setQueryStatus("complete"));
    }
  },
);

export const RUN_CARD_QUERY = "metabase/metabot/RUN_CARD_QUERY";
export const runCardQuery = createThunkAction(
  RUN_CARD_QUERY,
  () => async (dispatch: Dispatch) => {
    try {
      dispatch(setQueryStatus("running"));
      await dispatch(fetchQueryResults());
    } catch (error) {
      dispatch(setQueryError(error));
    } finally {
      dispatch(setQueryStatus("complete"));
    }
  },
);

export const FETCH_CARD = "metabase/metabot/FETCH_CARD";
export const fetchCard = createThunkAction(
  FETCH_CARD,
  () => async (dispatch: Dispatch, getState: GetState) => {
    const entityId = getEntityId(getState());
    const entityType = getEntityType(getState());
    const queryText = getQueryText(getState());

    if (entityType === "model") {
      return await MetabotApi.modelPrompt({
        modelId: entityId,
        question: queryText,
      });
    } else {
      return await MetabotApi.databasePrompt({
        databaseId: entityId,
        question: queryText,
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
