import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspacesNav } from "./WorkspacesNav";
import { WorkspacesAdminSettings } from "./components/WorkspacesAdminSettings";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspacesAdminSettings = WorkspacesAdminSettings;
    PLUGIN_WORKSPACES.WorkspacesNav = WorkspacesNav;
  }
}
