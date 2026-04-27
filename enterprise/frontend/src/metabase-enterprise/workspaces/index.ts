import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TableRemappingNav } from "./TableRemappingNav";
import { WorkspacesNav } from "./WorkspacesNav";
import {
  getWorkspaceAdminFullWidthRoutes,
  getWorkspaceAdminRoutes,
} from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspacesNav = WorkspacesNav;
    PLUGIN_WORKSPACES.TableRemappingNav = TableRemappingNav;
    PLUGIN_WORKSPACES.getWorkspaceAdminRoutes = getWorkspaceAdminRoutes;
    PLUGIN_WORKSPACES.getWorkspaceAdminFullWidthRoutes =
      getWorkspaceAdminFullWidthRoutes;
  }
}
