/**
 * Virtual module IDs the data-app dev toolchain exposes. Shared so the SDK's Vite
 * dev plugin (which resolves + serves them) and the rspack build (which
 * externalizes the config module and builds the dev entry) can't drift.
 *
 * NOTE: import specifiers and `declare module` names must be string literals, so a
 * couple of places repeat these by hand (`dev-entry.tsx`'s config import and
 * `vite-env.d.ts`'s `declare module`) — keep them in sync with the values here.
 */

/**
 * The dev entry the template's `index.html` imports; the dev plugin serves the
 * prebuilt bundle for it.
 *
 * @type {"virtual:metabase-data-app-dev-entry"}
 */
module.exports.DATA_APP_DEV_ENTRY_VIRTUAL_ID =
  "virtual:metabase-data-app-dev-entry";

/**
 * The config module the dev plugin generates (the app's allowed hosts + the bundle
 * URL/event); the dev entry imports it and the rspack build externalizes it.
 *
 * @type {"virtual:metabase-data-app-dev-config"}
 */
module.exports.DATA_APP_DEV_CONFIG_VIRTUAL_ID =
  "virtual:metabase-data-app-dev-config";
