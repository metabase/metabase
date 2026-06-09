/**
 * URL prefix the BE uses to serve the data-app iframe. Kept as a single
 * constant so the regex in `DataAppRouter`, the `src` builder in
 * `AppView`, and the URL-mirror logic don't drift apart.
 *
 * Must match the route definitions in `src/metabase/server/routes.clj`:
 *   `(GET ["/data-app/:name" …] [] index/data-app)`
 *   `(GET ["/data-app/:name/*" …] [] index/data-app)`
 * under the `/embed` context.
 */
export const DATA_APP_EMBED_PREFIX = "/embed/data-app";
