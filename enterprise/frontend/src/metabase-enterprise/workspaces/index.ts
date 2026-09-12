import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspacesSection } from "./components/WorkspacesSection";
import { WorkspacesSettingsSection } from "./components/WorkspacesSettingsSection";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspacesSection = WorkspacesSection;
    PLUGIN_WORKSPACES.WorkspacesSettingsSection = WorkspacesSettingsSection;
  }
}
