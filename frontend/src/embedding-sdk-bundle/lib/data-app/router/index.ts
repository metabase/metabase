import { browserHistory } from "metabase/router";

import {
  DATA_APP_EMBED_PREFIX,
  DataAppRouter,
  getBasename,
} from "./DataAppRouter";

export { DataAppRouter, getBasename, DATA_APP_EMBED_PREFIX };
export { DataAppLink, type DataAppLinkProps } from "./DataAppLink";
export { useDataAppLocation } from "./useDataAppLocation";

/**
 * Imperative routing surface exposed to the SDK bundle's public API.
 * The bundle never depends on a router library directly — it only relies
 * on this `{ getBasename, navigate, subscribe }` shape, backed by the
 * `browserHistory` singleton's function-based API.
 */
export const dataAppRouting = {
  getBasename,
  navigate: (to: string) => browserHistory.push(getBasename() + to),
  subscribe: (callback: () => void) => browserHistory.listen(callback),
};
