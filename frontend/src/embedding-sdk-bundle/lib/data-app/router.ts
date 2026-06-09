import { browserHistory } from "react-router";

import { getBasename } from "metabase/data_apps/router";

/**
 * Imperative routing primitives exposed on
 * `window.METABASE_EMBEDDING_SDK_BUNDLE.dataAppRouting` for the SDK
 * package's `useDataAppLocation` hook to consume. The hook owns React
 * state and lifecycle; these primitives are plain functions that talk
 * to the iframe's URL and the underlying history singleton.
 *
 * Keeping the implementation in the bundle means the SDK npm package
 * never bundles a router library — it just forwards to whatever the
 * host's data-app routing uses.
 */
export const dataAppRouting = {
  getBasename,
  navigate: (to: string) => browserHistory.push(getBasename() + to),
  subscribe: (callback: () => void) => browserHistory.listen(callback),
};
