import { definePluginSlot } from "metabase/plugins";
import type { State } from "metabase/redux/store";

const getDefaultApplicationPermissionsSelectors = () => ({
  canAccessDataModel: (_state: State) => false,
  canAccessSettings: (_state: State) => false,
  canManageSubscriptions: (_state: State) => true,
});

export const PLUGIN_APPLICATION_PERMISSIONS_SELECTORS = definePluginSlot(
  getDefaultApplicationPermissionsSelectors,
);
