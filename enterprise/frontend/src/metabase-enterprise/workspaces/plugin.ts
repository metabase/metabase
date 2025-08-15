import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { WorkspaceList } from "./components/WorkspaceList";
import { getWorkspaceRoutes } from "./routes";

// Add workspace support
PLUGIN_WORKSPACES.getRoutes = getWorkspaceRoutes;
PLUGIN_WORKSPACES.shouldShowWorkspaceInCollections = () => true;
PLUGIN_WORKSPACES.WorkspaceListComponent = WorkspaceList;