import { definePluginSlot } from "metabase/plugins";
import type { State } from "metabase/redux/store";

import { getUserIsAdmin } from "./selectors";

const getDefaultApplicationPermissionsSelectors = () => ({
  canAccessDataModel: (state: State) => getUserIsAdmin(state),
  canAccessSettings: (_state: State) => false,
  canManageSubscriptions: (_state: State) => true,
});

export const PLUGIN_APPLICATION_PERMISSIONS_SELECTORS = definePluginSlot(
  getDefaultApplicationPermissionsSelectors,
);
