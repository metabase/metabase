import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspaceSchemaSection } from "./components/WorkspaceSchemaSection";
import { WorkspaceToggleSection } from "./components/WorkspaceToggleSection";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspaceSchemaSection = WorkspaceSchemaSection;
    PLUGIN_WORKSPACES.WorkspaceToggleSection = WorkspaceToggleSection;
  }
}
