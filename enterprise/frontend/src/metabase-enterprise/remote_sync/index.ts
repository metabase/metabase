import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { RemoteSyncAdminSettings } from "./components/RemoteSyncAdminSettings";
import { SyncedCollectionsSidebarSection } from "./components/SyncedCollectionsSidebarSection";
import { REMOTE_SYNC_INVALIDATION_TAGS } from "./constants";
import { useSyncStatus } from "./hooks/use-sync-status";

if (hasPremiumFeature("remote_sync")) {
  PLUGIN_REMOTE_SYNC.RemoteSyncSettings = RemoteSyncAdminSettings;
  PLUGIN_REMOTE_SYNC.LibraryNav = LibraryNav;
  PLUGIN_REMOTE_SYNC.SyncedCollectionsSidebarSection =
    SyncedCollectionsSidebarSection;
  PLUGIN_REMOTE_SYNC.REMOTE_SYNC_INVALIDATION_TAGS =
    REMOTE_SYNC_INVALIDATION_TAGS;
  PLUGIN_REMOTE_SYNC.useSyncStatus = useSyncStatus;
}
