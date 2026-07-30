import type { LocationDescriptor } from "./types";

/**
 * Re-owned equivalent of react-router-redux's navigation action creators.
 *
 * `push`/`replace`/`go`/`goBack`/`goForward` dispatch a CALL_HISTORY_METHOD
 * action that `routerMiddleware` intercepts and applies to the history
 * ref. The action type string is preserved so the transport stays byte-identical
 * with the package we are shadowing.
 */
export const CALL_HISTORY_METHOD = "@@router/CALL_HISTORY_METHOD";

export type HistoryPushAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: "push"; args: [LocationDescriptor] };
};

export type HistoryReplaceAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: "replace"; args: [LocationDescriptor] };
};

export type HistoryGoAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: "go"; args: [number] };
};

export type HistoryGoBackAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: "goBack"; args: [] };
};

export type HistoryGoForwardAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: "goForward"; args: [] };
};

export type CallHistoryMethodAction =
  | HistoryPushAction
  | HistoryReplaceAction
  | HistoryGoAction
  | HistoryGoBackAction
  | HistoryGoForwardAction;

export const push = (location: LocationDescriptor): HistoryPushAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "push", args: [location] },
});

export const replace = (
  location: LocationDescriptor,
): HistoryReplaceAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "replace", args: [location] },
});

export const go = (n: number): HistoryGoAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "go", args: [n] },
});

export const goBack = (): HistoryGoBackAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "goBack", args: [] },
});

export const goForward = (): HistoryGoForwardAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "goForward", args: [] },
});

export const routerActions = { push, replace, go, goBack, goForward };
