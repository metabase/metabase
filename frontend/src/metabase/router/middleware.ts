import type { Middleware } from "@reduxjs/toolkit";
import type { History } from "history";
import { match } from "ts-pattern";

import {
  CALL_HISTORY_METHOD,
  type CallHistoryMethodAction,
} from "./navigation";

function isCallHistoryMethod(
  action: unknown,
): action is CallHistoryMethodAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    action.type === CALL_HISTORY_METHOD
  );
}

/**
 * Re-owned equivalent of react-router-redux's `routerMiddleware`.
 *
 * Holds the `history` ref, intercepts CALL_HISTORY_METHOD actions, and applies
 * the matching method to history. These actions never reach the reducers, just
 * like the package it replaces.
 */
export function routerMiddleware(history: History): Middleware {
  return () => (next) => (action) => {
    if (!isCallHistoryMethod(action)) {
      return next(action);
    }

    match(action.payload)
      .with({ method: "push" }, ({ args }) => history.push(args[0]))
      .with({ method: "replace" }, ({ args }) => history.replace(args[0]))
      .with({ method: "go" }, ({ args }) => history.go(args[0]))
      .with({ method: "goBack" }, () => history.goBack())
      .with({ method: "goForward" }, () => history.goForward())
      .exhaustive();
  };
}
