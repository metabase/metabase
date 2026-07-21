import type { Middleware } from "@reduxjs/toolkit";
import type { History } from "history";
import { match } from "ts-pattern";

import {
  CALL_HISTORY_METHOD,
  type CallHistoryMethodAction,
} from "./navigation";

/**
 * The slice of `history` the middleware drives. v3's `History` satisfies it, and
 * the v7 navigator adapter implements exactly these, so the middleware is engine
 * agnostic and the engine swap only changes which navigator is passed in.
 */
export type RouterNavigator = Pick<
  History,
  "push" | "replace" | "go" | "goBack" | "goForward"
>;

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
export function routerMiddleware(navigator: RouterNavigator): Middleware {
  return () => (next) => (action) => {
    if (!isCallHistoryMethod(action)) {
      return next(action);
    }

    match(action.payload)
      .with({ method: "push" }, ({ args }) => navigator.push(args[0]))
      .with({ method: "replace" }, ({ args }) => navigator.replace(args[0]))
      .with({ method: "go" }, ({ args }) => navigator.go(args[0]))
      .with({ method: "goBack" }, () => navigator.goBack())
      .with({ method: "goForward" }, () => navigator.goForward())
      .exhaustive();
  };
}
