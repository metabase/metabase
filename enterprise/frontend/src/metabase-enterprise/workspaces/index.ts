import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspacesNav } from "./WorkspacesNav";
import { WorkspacesSetupPage } from "./components/WorkspacesSetupPage";
import { WorkspacesTableRemappingsPage } from "./components/WorkspacesTableRemappingsPage";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspacesSetupPage = WorkspacesSetupPage;
    PLUGIN_WORKSPACES.WorkspacesTableRemappingsPage =
      WorkspacesTableRemappingsPage;
    PLUGIN_WORKSPACES.WorkspacesNav = WorkspacesNav;
  }
}
