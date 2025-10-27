import {
  PLUGIN_REDUCERS,
  PLUGIN_REDUX_MIDDLEWARES,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { RemoteSyncAdminSettings } from "./components/RemoteSyncAdminSettings/RemoteSyncAdminSettings";
import { SyncedCollectionsSidebarSection } from "./components/SyncedCollectionsSidebarSection/SyncedCollectionsSidebarSection";
import { REMOTE_SYNC_INVALIDATION_TAGS } from "./constants";
import { useSyncStatus } from "./hooks/use-sync-status";
import { remoteSyncListenerMiddleware } from "./middleware/remote-sync-listener-middleware";
import { remoteSyncReducer } from "./sync-task-slice";

if (hasPremiumFeature("remote_sync")) {
  PLUGIN_REMOTE_SYNC.RemoteSyncSettings = RemoteSyncAdminSettings;
  PLUGIN_REMOTE_SYNC.LibraryNav = LibraryNav;
  PLUGIN_REMOTE_SYNC.SyncedCollectionsSidebarSection =
    SyncedCollectionsSidebarSection;
  PLUGIN_REMOTE_SYNC.REMOTE_SYNC_INVALIDATION_TAGS =
    REMOTE_SYNC_INVALIDATION_TAGS;
  PLUGIN_REMOTE_SYNC.useSyncStatus = useSyncStatus;

  PLUGIN_REDUX_MIDDLEWARES.push(remoteSyncListenerMiddleware.middleware);
  PLUGIN_REDUCERS.remoteSyncPlugin = remoteSyncReducer;
}
