import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TableRemappingNav } from "./TableRemappingNav";
import {
  getDataStudioWorkspaceRoutes,
  getWorkspaceAdminFullWidthRoutes,
} from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.canManageWorkspaces = getUserIsAdmin;
    PLUGIN_WORKSPACES.TableRemappingNav = TableRemappingNav;
    PLUGIN_WORKSPACES.getWorkspaceAdminFullWidthRoutes =
      getWorkspaceAdminFullWidthRoutes;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes =
      getDataStudioWorkspaceRoutes;
  }
}
