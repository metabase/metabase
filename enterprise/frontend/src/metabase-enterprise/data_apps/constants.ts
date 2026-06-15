/**
 * URL prefix the BE uses to serve the data-app iframe.
 *
 * Single source of truth lives in the SDK bundle's data-app router, where
 * the basename regex consumes it. Re-exported here so host-side code
 * (`AppView`, `DataAppIframeApp`) and the SDK routing primitives can't drift
 * apart.
 *
 * Must match the route definitions in `src/metabase/server/routes.clj`:
 *   `(GET ["/data-app/:name" …] [] index/data-app)`
 *   `(GET ["/data-app/:name/*" …] [] index/data-app)`
 * under the `/embed` context.
 */
export { DATA_APP_EMBED_PREFIX } from "embedding-sdk-bundle/lib/data-app/router";

/**
 * `postMessage` type the iframe-top app (`DataAppIframeApp`) sends to the host
 * (`AppView`) when the bundle can't be loaded or crashes at runtime, so the host
 * can render the failure screen in its own (correctly themed) realm.
 */
export const DATA_APP_ERROR_MESSAGE_TYPE = "metabase.data-app.error" as const;

export type DataAppBundleErrorMessage = {
  type: typeof DATA_APP_ERROR_MESSAGE_TYPE;
  /** True when the app is enabled but its bundle hasn't synced yet (a 404). */
  notReady: boolean;
  /** The real error message, pulled out of the (possibly opaque) thrown value. */
  message?: string;
  /** The error's stack, when one could be read. */
  stack?: string;
};
