import type { LocationDescriptor } from "history";

/**
 * Re-owned equivalent of react-router-redux's navigation action creators.
 *
 * `push`/`replace`/`go`/`goBack`/`goForward` dispatch a CALL_HISTORY_METHOD
 * action that `routerMiddleware` intercepts and applies to the history
 * ref. The action type string is preserved so the transport stays byte-identical
 * with the package we are shadowing.
 */
export const CALL_HISTORY_METHOD = "@@router/CALL_HISTORY_METHOD";

type Call<Method extends string, Args extends unknown[]> = {
  type: typeof CALL_HISTORY_METHOD;
  payload: { method: Method; args: Args };
};

export type CallHistoryMethodAction =
  | Call<"push", [LocationDescriptor]>
  | Call<"replace", [LocationDescriptor]>
  | Call<"go", [number]>
  | Call<"goBack", []>
  | Call<"goForward", []>;

export const push = (
  location: LocationDescriptor,
): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "push", args: [location] },
});

export const replace = (
  location: LocationDescriptor,
): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "replace", args: [location] },
});

export const go = (n: number): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "go", args: [n] },
});

export const goBack = (): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "goBack", args: [] },
});

export const goForward = (): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: "goForward", args: [] },
});

export const routerActions = { push, replace, go, goBack, goForward };
