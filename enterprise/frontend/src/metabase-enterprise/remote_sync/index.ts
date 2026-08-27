import {
  PLUGIN_REDUCERS,
  PLUGIN_REDUX_MIDDLEWARES,
  PLUGIN_REMOTE_SYNC,
  lazyPluginComponent,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { REMOTE_SYNC_INVALIDATION_TAGS } from "./constants";
import { useGitSyncVisible } from "./hooks/use-git-sync-visible";
import { useHasLibraryDirtyChanges } from "./hooks/use-has-library-dirty-changes";
import { useHasTransformDirtyChanges } from "./hooks/use-has-transform-dirty-changes";
import { useRemoteSyncDirtyState } from "./hooks/use-remote-sync-dirty-state";
import { useSyncStatus } from "./hooks/use-sync-status";
import { remoteSyncListenerMiddleware } from "./middleware/remote-sync-listener-middleware";
import { getIsRemoteSyncReadOnly } from "./selectors";
import { remoteSyncReducer } from "./sync-task-slice";

// Both slots live in one module, so they share a loader and one chunk.
const syncedCollectionsSidebarSection = () =>
  import("./components/SyncedCollectionsSidebarSection");

/**
 * Initialize remote sync plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_REMOTE_SYNC.isEnabled = true;
    PLUGIN_REMOTE_SYNC.RemoteSyncSettings = lazyPluginComponent(() =>
      import("./components/RemoteSyncAdminSettings").then(
        ({ RemoteSyncAdminSettings }) => RemoteSyncAdminSettings,
      ),
    );
    PLUGIN_REMOTE_SYNC.LibraryNav = lazyPluginComponent(() =>
      import("./LibraryNav").then(({ LibraryNav }) => LibraryNav),
    );
    PLUGIN_REMOTE_SYNC.SyncedCollectionsSidebarSection = lazyPluginComponent(
      () =>
        syncedCollectionsSidebarSection().then(
          ({ SyncedCollectionsSidebarSection }) =>
            SyncedCollectionsSidebarSection,
        ),
    );
    PLUGIN_REMOTE_SYNC.GitSyncAppBarControls = lazyPluginComponent(() =>
      import("./components/GitSyncControls").then(
        ({ GitSyncControls }) => GitSyncControls,
      ),
    );
    PLUGIN_REMOTE_SYNC.GitSettingsModal = lazyPluginComponent(() =>
      import("./components/GitSettingsModal").then(
        ({ GitSettingsModal }) => GitSettingsModal,
      ),
    );
    PLUGIN_REMOTE_SYNC.CollectionsNavTree = lazyPluginComponent(() =>
      import("./components/CollectionsNavTree").then(
        ({ CollectionsNavTree }) => CollectionsNavTree,
      ),
    );
    PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge = lazyPluginComponent(() =>
      syncedCollectionsSidebarSection().then(
        ({ CollectionSyncStatusBadge }) => CollectionSyncStatusBadge,
      ),
    );
    PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem = lazyPluginComponent(() =>
      import("./components/GitSyncSetupMenuItem").then(
        ({ GitSyncSetupMenuItem }) => GitSyncSetupMenuItem,
      ),
    );
    PLUGIN_REMOTE_SYNC.REMOTE_SYNC_INVALIDATION_TAGS =
      REMOTE_SYNC_INVALIDATION_TAGS;

    // Hooks and selectors are called, not rendered, so they cannot be deferred.
    PLUGIN_REMOTE_SYNC.useSyncStatus = useSyncStatus;
    PLUGIN_REMOTE_SYNC.useGitSyncVisible = useGitSyncVisible;
    PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges = useHasLibraryDirtyChanges;
    PLUGIN_REMOTE_SYNC.useHasTransformDirtyChanges =
      useHasTransformDirtyChanges;
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly = getIsRemoteSyncReadOnly;
    PLUGIN_REMOTE_SYNC.useRemoteSyncDirtyState = useRemoteSyncDirtyState;

    PLUGIN_REDUX_MIDDLEWARES.push(remoteSyncListenerMiddleware.middleware);
    PLUGIN_REDUCERS.remoteSyncPlugin = remoteSyncReducer;
  }
}
