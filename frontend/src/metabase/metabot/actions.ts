import { createAction } from "redux-actions";
import { MetabotEntityId, MetabotEntityType } from "metabase-types/store";
import { MetabotFeedbackType } from "metabase-types/api";

export interface InitPayload {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialQueryText?: string;
}

export const INIT = "metabase/metabot/INIT";
export const init = createAction<InitPayload>(INIT);

export const RESET = "metabase/metabot/RESET";
export const reset = createAction(RESET);

export const SET_QUERY_TEXT = "metabase/metabot/SET_QUERY_TEXT";
export const setQueryText = createAction<string>(SET_QUERY_TEXT);

export const SET_FEEDBACK_TYPE = "metabase/metabot/SET_FEEDBACK_TYPE";
export const setFeedbackType =
  createAction<MetabotFeedbackType>(SET_FEEDBACK_TYPE);
