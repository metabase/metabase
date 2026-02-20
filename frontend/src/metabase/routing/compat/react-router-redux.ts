import { pushPath, replacePath } from "metabase/lib/navigation";

export const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";
export const CALL_HISTORY_METHOD = "@@router/CALL_HISTORY_METHOD";

type NavigationLocation =
  | string
  | {
      pathname?: string;
      search?: string;
      hash?: string;
      query?: Record<string, unknown>;
    };

type CallHistoryMethodPayload = {
  method: "push" | "replace" | "go" | "goBack" | "goForward";
  args: unknown[];
};

export type CallHistoryMethodAction = {
  type: typeof CALL_HISTORY_METHOD;
  payload: CallHistoryMethodPayload;
};

function updateLocation(
  method: CallHistoryMethodPayload["method"],
  args: unknown[],
) {
  if (typeof window === "undefined") {
    return;
  }

  switch (method) {
    case "push":
      pushPath(args[0] as NavigationLocation);
      break;
    case "replace":
      replacePath(args[0] as NavigationLocation);
      break;
    case "go":
      window.history.go((args[0] as number) ?? 0);
      break;
    case "goBack":
      window.history.back();
      break;
    case "goForward":
      window.history.forward();
      break;
  }
}

export const handleCallHistoryMethod = (action: unknown) => {
  if (
    !action ||
    typeof action !== "object" ||
    (action as CallHistoryMethodAction).type !== CALL_HISTORY_METHOD
  ) {
    return false;
  }

  const { method, args } = (action as CallHistoryMethodAction).payload;
  updateLocation(method, args);
  return true;
};

const callHistoryMethod = (
  method: CallHistoryMethodPayload["method"],
  ...args: unknown[]
): CallHistoryMethodAction => ({
  type: CALL_HISTORY_METHOD,
  payload: { method, args },
});

export const push = (location: NavigationLocation) =>
  callHistoryMethod("push", location);

export const replace = (location: NavigationLocation) =>
  callHistoryMethod("replace", location);

export const go = (index: number) => callHistoryMethod("go", index);

export const goBack = () => callHistoryMethod("goBack");

export const goForward = () => callHistoryMethod("goForward");

export const routerActions = {
  push,
  replace,
  go,
  goBack,
  goForward,
};
