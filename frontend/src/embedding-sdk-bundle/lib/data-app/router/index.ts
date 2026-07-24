import { getRawBrowserHistory } from "metabase/router";

import {
  DataAppRouter,
  getBasename,
  subscribeToDataAppHistory,
} from "./DataAppRouter";

export { DataAppRouter, getBasename };
export { DataAppLink, type DataAppLinkProps } from "./DataAppLink";
export { useDataAppLocation } from "./useDataAppLocation";

/**
 * Imperative routing surface exposed to the SDK bundle's public API.
 * The bundle never depends on a router library directly, it only relies on this
 * `{ getBasename, navigate, subscribe }` shape, backed by the browser history the
 * data app drives its iframe URL with.
 */
export const dataAppRouting = {
  getBasename,
  getPathname: () => getRawBrowserHistory().location.pathname,
  navigate: (to: string) => getRawBrowserHistory().push(getBasename() + to),
  subscribe: (callback: () => void) => subscribeToDataAppHistory(callback),
};
