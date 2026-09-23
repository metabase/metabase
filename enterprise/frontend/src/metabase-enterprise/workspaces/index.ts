import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { WorkspaceSchemaSection } from "./components/WorkspaceSchemaSection";

export function initializePlugin() {
  PLUGIN_WORKSPACES.WorkspaceSchemaSection = WorkspaceSchemaSection;
}
