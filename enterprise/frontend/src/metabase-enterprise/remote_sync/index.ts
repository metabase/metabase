import {
  PLUGIN_REDUCERS,
  PLUGIN_REDUX_MIDDLEWARES,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibraryNav } from "./LibraryNav";
import { CollectionsNavTree } from "./components/CollectionsNavTree";
import { GitSettingsModal } from "./components/GitSettingsModal";
import { GitSyncControls } from "./components/GitSyncControls";
import { GitSyncSetupMenuItem } from "./components/GitSyncSetupMenuItem";
import { RemoteSyncAdminSettings } from "./components/RemoteSyncAdminSettings";
import {
  CollectionSyncStatusBadge,
  SyncedCollectionsSidebarSection,
} from "./components/SyncedCollectionsSidebarSection";
import { REMOTE_SYNC_INVALIDATION_TAGS } from "./constants";
import { useGitSyncVisible } from "./hooks/use-git-sync-visible";
import { useHasLibraryDirtyChanges } from "./hooks/use-has-library-dirty-changes";
import { useHasTransformDirtyChanges } from "./hooks/use-has-transform-dirty-changes";
import { useSyncStatus } from "./hooks/use-sync-status";
import { remoteSyncListenerMiddleware } from "./middleware/remote-sync-listener-middleware";
import { remoteSyncReducer } from "./sync-task-slice";

/**
 * Initialize remote sync plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_REMOTE_SYNC.RemoteSyncSettings = RemoteSyncAdminSettings;
    PLUGIN_REMOTE_SYNC.LibraryNav = LibraryNav;
    PLUGIN_REMOTE_SYNC.SyncedCollectionsSidebarSection =
      SyncedCollectionsSidebarSection;
    PLUGIN_REMOTE_SYNC.GitSyncAppBarControls = GitSyncControls;
    PLUGIN_REMOTE_SYNC.GitSettingsModal = GitSettingsModal;
    PLUGIN_REMOTE_SYNC.CollectionsNavTree = CollectionsNavTree;
    PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge = CollectionSyncStatusBadge;
    PLUGIN_REMOTE_SYNC.REMOTE_SYNC_INVALIDATION_TAGS =
      REMOTE_SYNC_INVALIDATION_TAGS;
    PLUGIN_REMOTE_SYNC.useSyncStatus = useSyncStatus;
    PLUGIN_REMOTE_SYNC.useGitSyncVisible = useGitSyncVisible;
    PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem = GitSyncSetupMenuItem;
    PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges = useHasLibraryDirtyChanges;
    PLUGIN_REMOTE_SYNC.useHasTransformDirtyChanges =
      useHasTransformDirtyChanges;
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly = getIsRemoteSyncReadOnly;

    PLUGIN_REDUX_MIDDLEWARES.push(remoteSyncListenerMiddleware.middleware);
    PLUGIN_REDUCERS.remoteSyncPlugin = remoteSyncReducer;
  }
}
