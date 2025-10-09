import { PLUGIN_GIT_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { GitSyncSettings } from "./components/GitSyncSettings";
import { SyncedCollectionsSidebarSection } from "./components/SyncedCollectionsSidebarSection";
import { GIT_SYNC_INVALIDATION_TAGS } from "./constants";
import { useSyncStatus } from "./hooks/use-sync-status";

if (hasPremiumFeature("remote_sync")) {
  PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
  PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
  PLUGIN_GIT_SYNC.SyncedCollectionsSidebarSection =
    SyncedCollectionsSidebarSection;
  PLUGIN_GIT_SYNC.GIT_SYNC_INVALIDATION_TAGS = GIT_SYNC_INVALIDATION_TAGS;
  PLUGIN_GIT_SYNC.useSyncStatus = useSyncStatus;
}
