import { getCurrentHistory } from "metabase/router";

import { DataAppRouter, getBasename } from "./DataAppRouter";

export { DataAppRouter, getBasename };
export { DataAppLink, type DataAppLinkProps } from "./DataAppLink";
export { useDataAppLocation } from "./useDataAppLocation";

/**
 * Imperative routing surface exposed to the SDK bundle's public API.
 * The bundle never depends on a router library directly, it only relies on this
 * `{ getBasename, navigate, subscribe }` shape, backed by the history the app's
 * router is mounted on. Calls before the router mounts are no-ops.
 */
export const dataAppRouting = {
  getBasename,
  navigate: (to: string) => getCurrentHistory()?.push(getBasename() + to),
  subscribe: (callback: () => void) =>
    getCurrentHistory()?.listen(() => callback()) ?? (() => undefined),
};
