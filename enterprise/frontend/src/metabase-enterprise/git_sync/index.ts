import {
  PLUGIN_GIT_SYNC,
  PLUGIN_REDUCERS,
  PLUGIN_REDUX_MIDDLEWARES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { GitSyncSettings } from "./components/GitSyncSettings";
import { SyncedCollectionsSidebarSection } from "./components/SyncedCollectionsSidebarSection";
import { GIT_SYNC_INVALIDATION_TAGS } from "./constants";
import { useSyncStatus } from "./hooks/use-sync-status";
import { remoteSyncListener } from "./remote-sync-listener";
import { remoteSyncSlice } from "./remote-sync.slice";

if (hasPremiumFeature("remote_sync")) {
  PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
  PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
  PLUGIN_GIT_SYNC.SyncedCollectionsSidebarSection =
    SyncedCollectionsSidebarSection;
  PLUGIN_GIT_SYNC.GIT_SYNC_INVALIDATION_TAGS = GIT_SYNC_INVALIDATION_TAGS;
  PLUGIN_GIT_SYNC.useSyncStatus = useSyncStatus;
  PLUGIN_REDUCERS.remoteSyncPlugin = remoteSyncSlice.reducer;
  PLUGIN_REDUX_MIDDLEWARES.push(remoteSyncListener.middleware);
}
