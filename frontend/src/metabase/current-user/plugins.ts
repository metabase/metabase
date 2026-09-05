import type { State } from "metabase/redux/store";

const getDefaultApplicationPermissionsSelectors = () => ({
  canAccessDataModel: (_state: State) => false,
  canAccessSettings: (_state: State) => false,
  canManageSubscriptions: (_state: State) => true,
});

export const PLUGIN_APPLICATION_PERMISSIONS_SELECTORS =
  getDefaultApplicationPermissionsSelectors();

/**
 * @internal Do not call directly. Use reinitializePlugins from __support__/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_APPLICATION_PERMISSIONS_SELECTORS,
    getDefaultApplicationPermissionsSelectors(),
  );
}
