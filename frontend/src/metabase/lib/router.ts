import type { Action } from "@reduxjs/toolkit";
import type { History, LocationDescriptor } from "history";

/**
 * Centralized navigation helpers built on top of a react-router v3 History instance.
 *
 * All application code should import routing helpers from this module instead of
 * depending directly on react-router-redux. This keeps routing concerns isolated
 * and makes future React Router upgrades easier.
 */

let history: History | null = null;

export function setHistory(newHistory: History) {
  history = newHistory;
}

function getHistory(): History {
  if (!history) {
    throw new Error(
      "Router history has not been initialized. " +
        "Make sure setHistory is called from the app entrypoint.",
    );
  }

  return history;
}

type LocationLike = LocationDescriptor;

// Thunk-friendly navigation helpers. They intentionally match the
// react-router-redux API shape so existing call sites can keep doing:
//   dispatch(push("/some/path"))

export const push = (location: LocationLike) => () => {
  getHistory().push(location as any);
};

export const replace = (location: LocationLike) => () => {
  getHistory().replace(location as any);
};

export const goBack = () => () => {
  getHistory().goBack();
};

export const routerActions = {
  push,
  replace,
  goBack,
};
/**
 * Adapter for libraries like redux-auth-wrapper that expect a
 * (location) => Action redirect function. This performs an
 * imperative history.replace and returns a no-op Action so the
 * caller can still dispatch it if needed.
 */
export const redirectReplace = (location: LocationLike): Action => {
  getHistory().replace(location as any);
  return { type: "@@router/REDIRECT_REPLACE" };
};
