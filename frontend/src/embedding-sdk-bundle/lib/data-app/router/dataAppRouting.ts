import { getRawBrowserHistory } from "metabase/router";

import { getBasename } from "./DataAppRouter";

const subscribers = new Set<() => void>();
let unsubscribeFromHistory: (() => void) | undefined;

export const subscribeToDataAppRouting = (callback: () => void) => {
  subscribers.add(callback);

  unsubscribeFromHistory ??= getRawBrowserHistory().listen(() => {
    subscribers.forEach((subscriber) => subscriber());
  });

  return () => {
    subscribers.delete(callback);

    if (subscribers.size === 0) {
      unsubscribeFromHistory?.();
      unsubscribeFromHistory = undefined;
    }
  };
};

/** Routing helpers exposed on the bundle, for data apps to consume. */
export const dataAppRouting = {
  getBasename,
  navigate: (to: string) => getRawBrowserHistory().push(getBasename() + to),
  subscribe: subscribeToDataAppRouting,
};
