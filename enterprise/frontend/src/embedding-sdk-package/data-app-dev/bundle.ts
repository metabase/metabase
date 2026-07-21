/**
 * Build/runtime constants shared by the data-app dev server preset and its dev
 * plugin. The sandbox globals contract itself lives with the sandbox
 * (`metabase-enterprise/data_apps/sandbox/globals.ts`); it's re-exported here
 * so the dev preset keeps a single import site.
 */

export {
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
  DATA_APP_GLOBAL_NAMES,
} from "metabase-enterprise/data_apps/sandbox/globals";

/** The app entry the IIFE is built from. */
export const DATA_APP_ENTRY = "src/index.tsx";

/** Dev-only URL the dev entry fetches the freshly-built IIFE bundle from. */
export const DATA_APP_BUNDLE_URL = "/@data-app-bundle.js";

/** Custom HMR event the dev plugin emits on rebuild so the dev entry soft-reloads. */
export const DATA_APP_REBUILT_EVENT = "data-app:rebuilt";
