import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspaceDatabaseSection } from "./components/WorkspaceDatabaseSection";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspaceDatabaseSection = WorkspaceDatabaseSection;
  }
}
