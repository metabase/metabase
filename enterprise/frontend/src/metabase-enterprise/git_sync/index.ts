import { PLUGIN_GIT_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { GitSyncSettings } from "./components/GitSyncSettings";
import { SyncedCollectionsSidebarSection } from "./components/SyncedCollectionsSidebarSection";
import { getGitSyncInvalidationTags } from "./git-sync-cache-invalidation";
import { useSyncStatus } from "./hooks/use-sync-status";

if (hasPremiumFeature("remote_sync")) {
  PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
  PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
  PLUGIN_GIT_SYNC.SyncedCollectionsSidebarSection =
    SyncedCollectionsSidebarSection;
  PLUGIN_GIT_SYNC.getGitSyncInvalidationTags = getGitSyncInvalidationTags;
  PLUGIN_GIT_SYNC.useSyncStatus = useSyncStatus;
}
