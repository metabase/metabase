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
