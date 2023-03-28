import { handleActions } from "redux-actions";

export const entityId = handleActions({}, null);
export const entityType = handleActions({}, null);
export const card = handleActions({}, null);
export const originalCard = handleActions({}, null);
export const queryText = handleActions({}, "");
export const queryStatus = handleActions({}, "idle");
export const queryResults = handleActions({}, null);
export const queryError = handleActions({}, null);
export const feedbackType = handleActions({}, null);
export const feedbackStatus = handleActions({}, null);
