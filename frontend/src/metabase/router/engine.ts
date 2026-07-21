export type RouterEngine = "v3" | "v7";

/**
 * Which router engine to run: the legacy react-router v3 engine, or the v7
 * engine behind the `use-v7-router` flag.
 *
 * Read straight from `window.MetabaseBootstrap` rather than the redux settings
 * slice so it is available at mount, before the store exists (the router is
 * wired at the very top of `app.js`). Toggling the setting off is the instant
 * rollback path.
 */
export function getRouterEngine(): RouterEngine {
  return window.MetabaseBootstrap?.["use-v7-router"] === true ? "v7" : "v3";
}
