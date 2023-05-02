import { createAction as createActionOriginal } from "redux-actions";

import type { Action, ActionFunctionAny } from "redux-actions";

export { handleActions } from "redux-actions";

export function createAction(
  actionType: string,
): ActionFunctionAny<Action<any>>;
export function createAction<PayloadCreator>(
  actionType: string,
  payloadCreator: PayloadCreator,
): PayloadCreator;
export function createAction(actionType: any, payloadCreator?: any) {
  return createActionOriginal(actionType, payloadCreator);
}
