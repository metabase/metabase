import { PLUGIN_CONTENT_STUDIO } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { BranchEntityBanner } from "./components/BranchEntityBanner";
import { ContentStudioSidebar } from "./components/ContentStudioSidebar";
import { ContentStudioSyncControls } from "./components/SyncControls";
import { getContentStudioContentRoutes } from "./routes";
import { useSaveTargetCollectionId } from "./save-target";
import { ContentStudioScopeProvider } from "./scope";

export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_CONTENT_STUDIO.isEnabled = true;
    PLUGIN_CONTENT_STUDIO.getContentStudioContentRoutes =
      getContentStudioContentRoutes;
    PLUGIN_CONTENT_STUDIO.ContentStudioProvider = ContentStudioScopeProvider;
    PLUGIN_CONTENT_STUDIO.ContentStudioSidebar = ContentStudioSidebar;
    PLUGIN_CONTENT_STUDIO.ContentStudioSyncControls = ContentStudioSyncControls;
    PLUGIN_CONTENT_STUDIO.useSaveTargetCollectionId = useSaveTargetCollectionId;
    PLUGIN_CONTENT_STUDIO.BranchEntityBanner = BranchEntityBanner;
  }
}
